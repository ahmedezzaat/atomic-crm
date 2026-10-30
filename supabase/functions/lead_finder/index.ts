import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getSecret, setSecret } from "../_shared/integrationSecrets.ts";
import { normalizePhone } from "../_shared/whatsapp.ts";

// "Find leads": search Google Maps (Places API, Text Search) for businesses and
// import the ones the user ticks as companies. Prospects found this way have
// not opted in, so no automatic WhatsApp is sent: staff get a task instead.
const PLACES_URL =
  Deno.env.get("GOOGLE_PLACES_URL") ??
  "https://places.googleapis.com/v1/places:searchText";
const SOURCE = "google-maps";
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
const str = (v: unknown, max = 300) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

// Egyptian numbers come from Google in national form (01x...), assume +20.
const toE164 = (national?: string, international?: string) => {
  const raw = international || national || "";
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) {
    digits = digits.startsWith("0") ? `+20${digits.slice(1)}` : `+${digits}`;
  }
  return normalizePhone(digits) ? `+${normalizePhone(digits)}` : null;
};

async function ensureLeadSource() {
  const { data } = await supabaseAdmin
    .from("configuration")
    .select("config")
    .eq("id", 1)
    .maybeSingle();
  const config = (data?.config ?? {}) as Record<string, any>;
  const sources: { value: string; label: string }[] =
    config.companyLeadSources ?? [{ value: "nara", label: "NARA" }];
  if (sources.some((s) => s.value === SOURCE)) return;
  await supabaseAdmin.from("configuration").upsert({
    id: 1,
    config: {
      ...config,
      companyLeadSources: [...sources, { value: SOURCE, label: "Google Maps" }],
    },
  });
}

async function ensureTag(name: string): Promise<number> {
  const { data: found } = await supabaseAdmin
    .from("company_tags")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (found) return found.id;
  const { data } = await supabaseAdmin
    .from("company_tags")
    .insert({ name, color: "#c5dedd" })
    .select("id")
    .single();
  return data!.id;
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("id,administrator")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (!sale) return createErrorResponse(403, "Not a CRM user");

        const body = await req.json().catch(() => ({}));
        const key = await getSecret("google_places_key");

        if (body.action === "status") {
          return json({ configured: !!key, hint: key ? key.slice(-4) : "" });
        }

        if (body.action === "save_key") {
          if (!sale.administrator) {
            return createErrorResponse(403, "Only administrators can do this");
          }
          const value = str(body.key, 200);
          if (!value) return createErrorResponse(400, "Enter the key");
          await setSecret("google_places_key", value);
          return json({ configured: true, hint: value.slice(-4) });
        }

        if (body.action === "search") {
          if (!key) {
            return createErrorResponse(
              400,
              "Google key is not set. Ask an administrator to add it.",
            );
          }
          const query = str(body.query, 200);
          if (!query) return createErrorResponse(400, "Enter what to search");
          const res = await fetch(PLACES_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask": FIELDS,
            },
            body: JSON.stringify({
              textQuery: query,
              pageSize: 20,
              regionCode: "EG",
              ...(body.page_token
                ? { pageToken: str(body.page_token, 2000) }
                : {}),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return createErrorResponse(
              502,
              `Google error: ${data?.error?.message ?? res.status}`,
            );
          }

          const { data: known } = await supabaseAdmin
            .from("companies")
            .select("name,phone_number")
            .limit(20000);
          const phones = new Set(
            (known ?? [])
              .map((c) => normalizePhone(c.phone_number))
              .filter(Boolean),
          );
          const names = new Set(
            (known ?? []).map((c) => String(c.name).trim().toLowerCase()),
          );

          const places = (data.places ?? [])
            .filter((p: any) => p.businessStatus !== "CLOSED_PERMANENTLY")
            .map((p: any) => {
              const phone = toE164(
                p.nationalPhoneNumber,
                p.internationalPhoneNumber,
              );
              const name = p.displayName?.text ?? "";
              return {
                place_id: p.id,
                name,
                address: p.formattedAddress ?? "",
                phone,
                website: p.websiteUri ?? "",
                rating: p.rating ?? null,
                reviews: p.userRatingCount ?? null,
                maps_url: p.googleMapsUri ?? "",
                exists:
                  (!!phone && phones.has(normalizePhone(phone))) ||
                  names.has(name.trim().toLowerCase()),
              };
            });
          return json({ places, next_page_token: data.nextPageToken ?? null });
        }

        if (body.action === "import") {
          const items: any[] = Array.isArray(body.items)
            ? body.items.slice(0, 100)
            : [];
          const city = str(body.city, 100) || null;
          const segment = str(body.segment, 80);
          await ensureLeadSource();
          const tagId = segment ? await ensureTag(segment) : null;

          const { data: cfg } = await supabaseAdmin
            .from("configuration")
            .select("config")
            .eq("id", 1)
            .maybeSingle();
          const stage =
            (cfg?.config as any)?.dealStages?.[0]?.value ?? "opportunity";
          const category =
            (cfg?.config as any)?.dealCategories?.[0]?.value ?? "other";

          const { data: known } = await supabaseAdmin
            .from("companies")
            .select("name,phone_number")
            .limit(20000);
          const phones = new Set(
            (known ?? [])
              .map((c) => normalizePhone(c.phone_number))
              .filter(Boolean),
          );
          const names = new Set(
            (known ?? []).map((c) => String(c.name).trim().toLowerCase()),
          );

          let created = 0;
          let skipped = 0;
          for (const item of items) {
            const name = str(item.name, 200);
            const phone = item.phone ? toE164(str(item.phone, 40)) : null;
            if (
              !name ||
              (phone && phones.has(normalizePhone(phone))) ||
              names.has(name.toLowerCase())
            ) {
              skipped++;
              continue;
            }
            const extra = [
              segment,
              item.rating
                ? `Google rating ${item.rating} (${item.reviews ?? 0} reviews)`
                : "",
              str(item.maps_url, 500),
            ]
              .filter(Boolean)
              .join("\n");
            const { data: company, error } = await supabaseAdmin
              .from("companies")
              .insert({
                name,
                phone_number: phone,
                website: str(item.website, 300) || null,
                address: str(item.address, 300) || null,
                city,
                lead_source: SOURCE,
                description: extra || null,
                sales_id: sale.id,
                tags: tagId ? [tagId] : [],
                whatsapp_opt_in: false,
              })
              .select("id")
              .single();
            if (error || !company) {
              skipped++;
              continue;
            }
            if (phone) phones.add(normalizePhone(phone));
            names.add(name.toLowerCase());

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
              sales_id: sale.id,
              index: (last?.index ?? -1) + 1,
              contact_ids: [],
            });
            await supabaseAdmin.from("tasks").insert({
              company_id: company.id,
              sales_id: sale.id,
              type: "none",
              text: `Introduce Kords to ${name} (found on Google Maps)`,
              due_date: new Date(Date.now() + 86400_000).toISOString(),
            });
            created++;
          }
          return json({ created, skipped });
        }

        return createErrorResponse(400, "Unknown action");
      }),
    ),
  ),
);
