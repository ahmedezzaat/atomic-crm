import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhone } from "../_shared/whatsapp.ts";

// Enrich a company from its own public website: emails, extra phone numbers,
// WhatsApp links and social profiles. It reads the home page and at most two
// contact/about pages, never crawls, and only follows public addresses.
const MAX_BYTES = 600_000;
const FETCH_TIMEOUT_MS = 8000;
const BATCH_LIMIT = 25;
const BUDGET_MS = 100_000;
const CONCURRENCY = 4;
// Tests point this at a stand-in site on localhost
const ALLOW_PRIVATE = Deno.env.get("ENRICH_ALLOW_PRIVATE") === "true";
const MARKER = "Found on the company website";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const privateIp = (ip: string) =>
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
    ip,
  ) ||
  ip === "::1" ||
  /^(fc|fd|fe80)/i.test(ip);

/** Only public http(s) addresses: no localhost, private ranges or odd ports. */
async function safeUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (ALLOW_PRIVATE) return url;
  if (url.port && !["80", "443"].includes(url.port)) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return null;
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    return privateIp(host) ? null : url;
  }
  try {
    const ips = await Deno.resolveDns(host, "A");
    if (ips.length === 0 || ips.some(privateIp)) return null;
  } catch {
    return null;
  }
  return url;
}

async function fetchHtml(start: URL): Promise<string | null> {
  let url: URL | null = start;
  for (let hop = 0; hop < 4 && url; hop++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "KordsCRM-Enrich/1.0 (business contact lookup)",
        Accept: "text/html",
      },
    }).catch(() => null);
    if (!response) return null;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      url = location ? await safeUrl(new URL(location, url).href) : null;
      continue;
    }
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|text/i.test(type)) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => undefined);
    const all = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    return new TextDecoder().decode(all);
  }
  return null;
}

const NOISE_EMAIL =
  /(\.(png|jpe?g|gif|svg|webp|css|js)$|example\.|sentry|wixpress|domain\.com|your(email|name)|^email@|^name@|^user@|noreply|no-reply)/i;

function extract(html: string) {
  const text = html
    .replace(/&#0*64;|&commat;|\[at\]|\(at\)/gi, "@")
    .replace(/&amp;/g, "&");

  const emails = new Set<string>();
  for (const m of text.matchAll(
    /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi,
  )) {
    const e = m[0].toLowerCase();
    if (!NOISE_EMAIL.test(e)) emails.add(e);
  }

  const phones = new Set<string>();
  const addPhone = (raw: string) => {
    const p = normalizePhone(raw.replace(/^\+?20(?=\d{10}$)/, "0"));
    if (p) phones.add(p);
  };
  for (const m of text.matchAll(/tel:([+\d\s().-]{8,20})/gi)) addPhone(m[1]);
  for (const m of text.matchAll(
    /(?:\+|00)?20[\s-]?1[0125][\s\d-]{8,10}|(?<!\d)01[0125][\s-]?\d{4}[\s-]?\d{4}(?!\d)/g,
  ))
    addPhone(m[0]);
  for (const m of text.matchAll(/wa\.me\/\+?(\d{8,15})/gi)) phones.add(m[1]);
  for (const m of text.matchAll(
    /whatsapp\.com\/send\/?\?[^"'\s]*phone=\+?(\d{8,15})/gi,
  ))
    phones.add(m[1]);

  const links: Record<string, string> = {};
  const social: [string, RegExp][] = [
    [
      "facebook",
      /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|tr\?|plugins|dialog|login)[A-Za-z0-9._\-/%]+/i,
    ],
    [
      "instagram",
      /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore|accounts)[A-Za-z0-9._]+/i,
    ],
    [
      "linkedin",
      /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9._\-%]+/i,
    ],
    ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+/i],
    [
      "x",
      /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?!share|intent|home)[A-Za-z0-9_]+/i,
    ],
  ];
  for (const [name, re] of social) {
    const m = text.match(re);
    if (m) links[name] = m[0].replace(/[/.]+$/, "");
  }
  return { emails, phones, links };
}

function contactPages(html: string, base: URL): URL[] {
  const found: URL[] = [];
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (
      !/(contact|about|اتصل|تواصل|من-نحن|من نحن)/i.test(
        decodeURIComponent(m[1]).slice(0, 200),
      )
    )
      continue;
    try {
      const u = new URL(m[1], base);
      if (u.hostname === base.hostname && !found.some((f) => f.href === u.href))
        found.push(u);
    } catch {
      // ignore bad link
    }
    if (found.length >= 2) break;
  }
  return found;
}

async function enrichOne(company: {
  id: number;
  website: string | null;
  phone_number: string | null;
  linkedin_url: string | null;
  email: string | null;
  context_links: unknown;
  sales_id: number | null;
}) {
  const start = company.website ? await safeUrl(company.website) : null;
  if (!start) return { id: company.id, status: "no_website" };

  const home = await fetchHtml(start);
  if (home === null) return { id: company.id, status: "unreachable" };
  const pages = [home];
  for (const u of contactPages(home, start)) {
    const safe = await safeUrl(u.href);
    const html = safe ? await fetchHtml(safe) : null;
    if (html) pages.push(html);
  }

  const emails = new Set<string>();
  const phones = new Set<string>();
  const links: Record<string, string> = {};
  for (const html of pages) {
    const r = extract(html);
    r.emails.forEach((e) => emails.add(e));
    r.phones.forEach((p) => phones.add(p));
    for (const [k, v] of Object.entries(r.links)) links[k] ??= v;
  }
  const own = normalizePhone(company.phone_number);
  if (own) phones.delete(own);
  const emailList = [...emails].slice(0, 5);
  const phoneList = [...phones].slice(0, 5);

  if (emailList.length || phoneList.length) {
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("company_id", company.id)
      .eq("background", MARKER)
      .maybeSingle();
    const values = {
      email_jsonb: emailList.map((email) => ({ email, type: "Work" })),
      phone_jsonb: phoneList.map((n) => ({ number: `+${n}`, type: "Work" })),
      last_seen: new Date().toISOString(),
    };
    if (existing) {
      await supabaseAdmin.from("contacts").update(values).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("contacts").insert({
        first_name: "Website",
        last_name: "contact",
        background: MARKER,
        company_id: company.id,
        sales_id: company.sales_id,
        first_seen: new Date().toISOString(),
        ...values,
      });
    }
  }

  const update: Record<string, unknown> = {
    enriched_at: new Date().toISOString(),
  };
  const known = Array.isArray(company.context_links)
    ? (company.context_links as string[])
    : [];
  const { linkedin, ...others } = links;
  const merged = [...new Set([...known, ...Object.values(others)])];
  if (merged.length !== known.length) update.context_links = merged;
  if (linkedin && !company.linkedin_url) update.linkedin_url = linkedin;
  // the first email found becomes the company email when it has none
  if (!company.email && emailList.length) update.email = emailList[0];
  // a company with no number at all gets the first mobile found, so it can be messaged
  if (!own && phoneList.length) update.phone_number = `+${phoneList[0]}`;
  await supabaseAdmin.from("companies").update(update).eq("id", company.id);

  return {
    id: company.id,
    status: "ok",
    emails: emailList.length,
    phones: phoneList.length,
    links: Object.keys(links).length,
  };
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const body = await req.json().catch(() => ({}));
        const ids: number[] = (
          Array.isArray(body.company_ids)
            ? body.company_ids
            : body.company_id
              ? [body.company_id]
              : []
        )
          .map(Number)
          .filter(Boolean)
          .slice(0, BATCH_LIMIT);
        if (ids.length === 0) return createErrorResponse(400, "No companies");

        const { data: companies } = await supabaseAdmin
          .from("companies")
          .select(
            "id,website,phone_number,linkedin_url,email,context_links,sales_id",
          )
          .in("id", ids);

        const started = Date.now();
        const queue = [...(companies ?? [])];
        const results: Record<string, unknown>[] = [];
        const worker = async () => {
          for (let c = queue.shift(); c; c = queue.shift()) {
            if (Date.now() - started > BUDGET_MS) {
              results.push({ id: c.id, status: "skipped" });
              continue;
            }
            try {
              results.push(await enrichOne(c));
            } catch (e) {
              results.push({
                id: c.id,
                status: "error",
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));

        const ok = results.filter((r) => r.status === "ok");
        return json({
          results,
          enriched: ok.length,
          emails: ok.reduce((n, r) => n + Number(r.emails ?? 0), 0),
          phones: ok.reduce((n, r) => n + Number(r.phones ?? 0), 0),
        });
      }),
    ),
  ),
);
