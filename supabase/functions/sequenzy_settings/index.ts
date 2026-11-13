import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  getOrCreateSecret,
  getSecret,
  setSecret,
} from "../_shared/integrationSecrets.ts";
import {
  kickSync,
  queueSize,
  sequenzyConfig,
  sequenzyFetch,
} from "../_shared/sequenzy.ts";

// Administrators connect Sequenzy here. The API key is write only: the app only
// learns whether it is set and its last 4 characters.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

async function status() {
  const { apiKey, listId, enabled } = await sequenzyConfig();
  return {
    key_set: !!apiKey,
    key_hint: apiKey ? apiKey.slice(-4) : "",
    list_id: listId ?? "",
    enabled,
    pending: await queueSize(),
  };
}

// Queue every email already in the CRM
async function backfill() {
  let queued = 0;
  const page = 1000;
  const entries = new Map<string, Record<string, unknown>>();
  for (let from = 0; ; from += page) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("name,email")
      .neq("email", "")
      .not("email", "is", null)
      .order("id")
      .range(from, from + page - 1);
    for (const c of data ?? []) {
      const email = String(c.email).trim().toLowerCase();
      if (email.includes("@")) {
        entries.set(email, {
          email,
          first_name: c.name,
          last_name: "",
          company: c.name,
          source: "company",
        });
      }
    }
    if ((data?.length ?? 0) < page) break;
  }
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id,name")
    .limit(100000);
  const nameOf = new Map((companies ?? []).map((c) => [c.id, c.name]));
  for (let from = 0; ; from += page) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("first_name,last_name,company_id,email_jsonb")
      .not("email_jsonb", "is", null)
      .order("id")
      .range(from, from + page - 1);
    for (const c of data ?? []) {
      for (const item of (c.email_jsonb as { email?: string }[]) ?? []) {
        const email = String(item?.email ?? "")
          .trim()
          .toLowerCase();
        if (email.includes("@")) {
          entries.set(email, {
            email,
            first_name: c.first_name ?? "",
            last_name: c.last_name ?? "",
            company: nameOf.get(c.company_id) ?? "",
            source: "contact",
          });
        }
      }
    }
    if ((data?.length ?? 0) < page) break;
  }

  const all = [...entries.values()];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    // new addresses only: anything already queued keeps its place
    const { data: existing } = await supabaseAdmin
      .from("sequenzy_queue")
      .select("email")
      .in(
        "email",
        chunk.map((r) => r.email as string),
      );
    const have = new Set((existing ?? []).map((r) => r.email.toLowerCase()));
    const fresh = chunk.filter((r) => !have.has(r.email as string));
    if (fresh.length) {
      const { error } = await supabaseAdmin
        .from("sequenzy_queue")
        .insert(fresh);
      if (error) throw error;
      queued += fresh.length;
    }
  }
  return queued;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("administrator")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (!sale?.administrator) {
          return createErrorResponse(403, "Only administrators can do this");
        }

        const body = await req.json().catch(() => ({}));

        if (body.action === "save") {
          if (typeof body.api_key === "string" && body.api_key.trim()) {
            await setSecret("sequenzy_api_key", body.api_key.trim());
          }
          if (typeof body.list_id === "string") {
            await setSecret("sequenzy_list_id", body.list_id.trim());
          }
          if (typeof body.enabled === "boolean") {
            await setSecret("sequenzy_enabled", body.enabled ? "1" : "0");
          }
          // the database needs these to call the sync function
          if (!(await getSecret("functions_url"))) {
            await setSecret(
              "functions_url",
              `${Deno.env.get("SUPABASE_URL")}/functions/v1`,
            );
          }
          await getOrCreateSecret("cron_token");
          return json(await status());
        }

        if (body.action === "lists") {
          const { apiKey } = await sequenzyConfig();
          if (!apiKey) {
            return createErrorResponse(400, "Save the API key first");
          }
          const res = await sequenzyFetch(apiKey, "/lists");
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return createErrorResponse(
              400,
              `Sequenzy said: ${data?.error ?? res.status}`,
            );
          }
          return json({
            lists: (data.lists ?? []).map((l: any) => ({
              id: l.id,
              name: l.name,
            })),
          });
        }

        if (body.action === "backfill") {
          const { apiKey, listId, enabled } = await sequenzyConfig();
          if (!apiKey || !listId || !enabled) {
            return createErrorResponse(
              400,
              "Save the API key, choose a list and turn the sync on first",
            );
          }
          const queued = await backfill();
          EdgeRuntime.waitUntil(kickSync());
          return json({ queued, ...(await status()) });
        }

        return json(await status());
      }),
    ),
  ),
);
