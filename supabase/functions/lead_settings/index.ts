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

// Administrators save the WhatsApp (Meta) and lead capture settings here.
// Secrets are write only: the app learns whether they are set and their last
// 4 characters. The webhook verify token and the lead API key are generated.
const SECRET_FIELDS = {
  access_token: "wa_access_token",
  app_secret: "wa_app_secret",
} as const;
const PLAIN_FIELDS = {
  phone_number_id: "wa_phone_number_id",
  template_name: "wa_template_name",
  template_language: "wa_template_language",
  template_has_name: "wa_template_has_name",
} as const;

const hint = (value?: string) =>
  value ? { set: true, hint: value.slice(-4) } : { set: false, hint: "" };
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

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
        let newLeadKey: string | undefined;
        if (body.action === "save") {
          for (const [field, key] of Object.entries(SECRET_FIELDS)) {
            const value = body[field];
            if (typeof value === "string" && value.trim() !== "") {
              await setSecret(key, value.trim());
            }
          }
          for (const [field, key] of Object.entries(PLAIN_FIELDS)) {
            const value = body[field];
            if (typeof value === "string" && value.trim() !== "") {
              await setSecret(key, value.trim());
            }
          }
        }
        if (body.action === "new_lead_key") {
          // shown once: only a hash-free hint is kept readable afterwards
          newLeadKey = crypto.randomUUID().replaceAll("-", "");
          await setSecret("lead_api_key", newLeadKey);
        }

        const plain = async (key: string) => (await getSecret(key)) ?? "";
        return json({
          access_token: hint(await getSecret(SECRET_FIELDS.access_token)),
          app_secret: hint(await getSecret(SECRET_FIELDS.app_secret)),
          lead_api_key: hint(await getSecret("lead_api_key")),
          new_lead_key: newLeadKey,
          phone_number_id: await plain(PLAIN_FIELDS.phone_number_id),
          template_name: await plain(PLAIN_FIELDS.template_name),
          template_language:
            (await plain(PLAIN_FIELDS.template_language)) || "ar",
          template_has_name:
            (await plain(PLAIN_FIELDS.template_has_name)) !== "no",
          verify_token: await getOrCreateSecret("wa_verify_token"),
          webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp_webhook`,
          lead_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/lead_capture`,
        });
      }),
    ),
  ),
);
