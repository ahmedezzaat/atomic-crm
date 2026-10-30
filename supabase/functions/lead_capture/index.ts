import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getSecret, setSecret } from "../_shared/integrationSecrets.ts";
import {
  normalizePhone,
  sendWelcome,
  whatsappConfigured,
} from "../_shared/whatsapp.ts";

// Lead intake. Two ways in:
//  - the public "Request a demo" form (rate limited, lead source "website")
//  - trusted tools (Meta lead ads, Zapier, n8n...) sending the x-api-key header
// A new lead becomes a company (+ contact), a deal in the first stage, a task
// for the next salesperson in rotation and, with consent, a WhatsApp welcome.
const WEB_FORM_SOURCE = "website";
const WEB_FORM_PER_HOUR = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const str = (v: unknown, max = 300) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-|-$/g, "");

async function nextSalesperson(): Promise<number | null> {
  const { data: people } = await supabaseAdmin
    .from("sales")
    .select("id")
    .eq("disabled", false)
    .order("id");
  if (!people?.length) return null;
  const last = Number((await getSecret("lead_last_sales_id")) ?? 0);
  const next = people.find((p) => p.id > last) ?? people[0];
  await setSecret("lead_last_sales_id", String(next.id));
  return next.id;
}

async function ensureLeadSource(value: string, label: string) {
  const { data } = await supabaseAdmin
    .from("configuration")
    .select("config")
    .eq("id", 1)
    .maybeSingle();
  const config = (data?.config ?? {}) as Record<string, any>;
  const sources: { value: string; label: string }[] =
    config.companyLeadSources ?? [{ value: "nara", label: "NARA" }];
  if (sources.some((s) => s.value === value)) return;
  await supabaseAdmin.from("configuration").upsert({
    id: 1,
    config: { ...config, companyLeadSources: [...sources, { value, label }] },
  });
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }
    const body = await req.json().catch(() => ({}));

    const apiKey = req.headers.get("x-api-key");
    const expectedKey = await getSecret("lead_api_key");
    const trusted = !!apiKey && !!expectedKey && apiKey === expectedKey;
    if (apiKey && !trusted) return createErrorResponse(401, "Invalid API key");

    // Public form: honeypot + hourly cap
    if (!trusted) {
      if (str(body.hp)) return json({ status: "ok" }); // bots fill hidden fields
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await supabaseAdmin
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("lead_source", WEB_FORM_SOURCE)
        .gte("created_at", since);
      if ((count ?? 0) >= WEB_FORM_PER_HOUR) {
        return createErrorResponse(
          429,
          "Too many requests, please try again later",
        );
      }
    }

    const name = str(body.name, 200);
    const phone = normalizePhone(str(body.phone, 40));
    if (!name)
      return createErrorResponse(400, "Please enter your company name");
    if (!phone)
      return createErrorResponse(400, "Please enter a valid phone number");

    const source =
      trusted && str(body.lead_source)
        ? slug(str(body.lead_source, 60))
        : WEB_FORM_SOURCE;
    const sourceLabel =
      source === WEB_FORM_SOURCE ? "Website form" : str(body.lead_source, 60);
    const optIn = body.whatsapp_opt_in === true;
    const note = str(body.message, 1000);

    // Already known? Do not duplicate, tell the account manager instead.
    const { data: known } = await supabaseAdmin
      .from("companies")
      .select("id,name,phone_number,sales_id,whatsapp_opted_out")
      .not("phone_number", "is", null)
      .limit(10000);
    const existing = (known ?? []).find(
      (c) => normalizePhone(c.phone_number) === phone,
    );
    if (existing) {
      await supabaseAdmin.from("tasks").insert({
        company_id: existing.id,
        sales_id: existing.sales_id,
        type: "none",
        text: `${existing.name} sent a new request${note ? `: ${note.slice(0, 120)}` : ""}`,
        due_date: new Date().toISOString(),
      });
      if (optIn) {
        await supabaseAdmin
          .from("companies")
          .update({ whatsapp_opt_in: true })
          .eq("id", existing.id);
      }
      return json({ status: "existing", company_id: existing.id });
    }

    const salesId = await nextSalesperson();
    await ensureLeadSource(source, sourceLabel);

    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .insert({
        name,
        phone_number: `+${phone}`,
        city: str(body.city, 100) || null,
        lead_source: source,
        description: note || null,
        sales_id: salesId,
        whatsapp_opt_in: optIn,
      })
      .select("id")
      .single();
    if (error) return createErrorResponse(500, error.message);

    const contactName = str(body.contact_name, 150);
    if (contactName) {
      const [first, ...rest] = contactName.split(/\s+/);
      const email = str(body.email, 200);
      await supabaseAdmin.from("contacts").insert({
        first_name: first,
        last_name: rest.join(" "),
        company_id: company.id,
        sales_id: salesId,
        email_jsonb: email ? [{ email, type: "Work" }] : [],
        phone_jsonb: [{ number: `+${phone}`, type: "Work" }],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });
    }

    // Deal in the first pipeline stage
    const { data: cfg } = await supabaseAdmin
      .from("configuration")
      .select("config")
      .eq("id", 1)
      .maybeSingle();
    const stage = (cfg?.config as any)?.dealStages?.[0]?.value ?? "opportunity";
    const category =
      (cfg?.config as any)?.dealCategories?.[0]?.value ?? "other";
    const { data: last } = await supabaseAdmin
      .from("deals")
      .select("index")
      .eq("stage", stage)
      .order("index", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabaseAdmin.from("deals").insert({
      name,
      company_id: company.id,
      stage,
      category,
      amount: 0,
      sales_id: salesId,
      index: (last?.index ?? -1) + 1,
      contact_ids: [],
    });

    await supabaseAdmin.from("tasks").insert({
      company_id: company.id,
      sales_id: salesId,
      type: "none",
      text: `Contact new lead: ${name}${note ? ` (${note.slice(0, 120)})` : ""}`,
      due_date: new Date(Date.now() + 3600_000).toISOString(),
    });

    // WhatsApp welcome, only with consent and when WhatsApp is set up
    let welcome = "skipped";
    if (optIn && (await whatsappConfigured())) {
      const result = await sendWelcome({
        companyId: company.id,
        phone,
        name: contactName || name,
        salesId,
      });
      welcome = result.error ? `failed: ${result.error}` : "sent";
    }

    return json({ status: "created", company_id: company.id, welcome });
  }),
);
