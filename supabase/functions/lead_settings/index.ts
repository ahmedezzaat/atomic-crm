import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { API_BASE } from "../_shared/whatsapp.ts";
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
  // for connecting a number that is also used in the WhatsApp Business app
  app_id: "wa_app_id",
  config_id: "wa_config_id",
} as const;

/** Which WhatsApp account and number a sign-in was granted, asked from Meta. */
async function discoverAccount(
  accessToken: string,
  appId: string,
  appSecret: string,
  knownWaba: string,
  knownPhone: string,
) {
  const none = { wabaId: "", phoneNumberId: "" };
  const debugUrl = new URL(`${API_BASE}/debug_token`);
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
  const debug = await fetch(debugUrl)
    .then((r) => r.json())
    .catch(() => ({}));
  const scopes: { scope: string; target_ids?: string[] }[] =
    debug?.data?.granular_scopes ?? [];
  const wabaIds = scopes
    .filter((s) => s.scope === "whatsapp_business_management")
    .flatMap((s) => s.target_ids ?? []);
  const options: { wabaId: string; phoneNumberId: string }[] = [];
  for (const wabaId of wabaIds) {
    const list = await fetch(`${API_BASE}/${wabaId}/phone_numbers?fields=id`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .catch(() => ({}));
    for (const n of list?.data ?? []) {
      options.push({ wabaId, phoneNumberId: String(n.id) });
    }
  }
  return (
    options.find((o) => o.phoneNumberId === knownPhone) ??
    options.find((o) => o.wabaId === knownWaba) ??
    options[0] ??
    none
  );
}

async function phoneDetails(accessToken: string, phoneNumberId: string) {
  const details = await fetch(
    `${API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
    .then((r) => r.json())
    .catch(() => ({}));
  return details?.display_phone_number
    ? `${details.display_phone_number}${details.verified_name ? ` (${details.verified_name})` : ""}`
    : "";
}

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
              if (field === "access_token") {
                await setSecret("wa_connection_mode", "cloud");
              }
            }
          }
          for (const [field, key] of Object.entries(PLAIN_FIELDS)) {
            const value = body[field];
            if (typeof value === "string" && value.trim() !== "") {
              await setSecret(key, value.trim());
            }
          }
        }
        let connectError: string | undefined;
        if (body.action === "connect_coexistence") {
          // Meta's Embedded Signup finished in the browser and gave us a one-time
          // code plus the account and number it created. Trade the code for a token.
          const appId = await getSecret("wa_app_id");
          const appSecret = await getSecret("wa_app_secret");
          const code = String(body.code ?? "");
          let wabaId = String(body.waba_id ?? "");
          let phoneNumberId = String(body.phone_number_id ?? "");
          if (!appId || !appSecret) {
            connectError = "Save the Meta App ID and the App secret first";
          } else if (!code) {
            connectError = "Meta did not return a sign-in code. Try again.";
          } else {
            const url = new URL(`${API_BASE}/oauth/access_token`);
            url.searchParams.set("client_id", appId);
            url.searchParams.set("client_secret", appSecret);
            url.searchParams.set("code", code);
            const exchange = await fetch(url);
            const token = await exchange.json().catch(() => ({}));
            if (!exchange.ok || !token.access_token) {
              connectError = `Meta refused the sign-in: ${token?.error?.message ?? exchange.status}`;
            } else {
              // Meta sends the account and number ids in a browser message, but skips
              // it when the number is already connected. Then ask Meta what this
              // sign-in was granted, preferring the account we already know.
              if (!wabaId || !phoneNumberId) {
                const found = await discoverAccount(
                  token.access_token,
                  appId,
                  appSecret,
                  (await getSecret("wa_waba_id")) ?? "",
                  (await getSecret("wa_phone_number_id")) ?? "",
                );
                wabaId = found.wabaId;
                phoneNumberId = found.phoneNumberId;
              }
              if (!wabaId || !phoneNumberId) {
                connectError =
                  "Signed in, but Meta shows no WhatsApp number on this login. Make sure the number is active in the WhatsApp Business app and that you pick its business account.";
              } else {
                // let the app receive this account's messages
                const subscribe = await fetch(
                  `${API_BASE}/${wabaId}/subscribed_apps`,
                  {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token.access_token}` },
                  },
                );
                if (!subscribe.ok) {
                  const detail = await subscribe.json().catch(() => ({}));
                  connectError = `Connected, but Meta would not subscribe the app: ${detail?.error?.message ?? subscribe.status}`;
                }
                await setSecret("wa_access_token", token.access_token);
                await setSecret("wa_phone_number_id", phoneNumberId);
                await setSecret("wa_waba_id", wabaId);
                await setSecret("wa_connection_mode", "coexistence");
                const shown = await phoneDetails(
                  token.access_token,
                  phoneNumberId,
                );
                if (shown) await setSecret("wa_display_phone", shown);
              }
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
          connect_error: connectError,
          app_id: await plain(PLAIN_FIELDS.app_id),
          config_id: await plain(PLAIN_FIELDS.config_id),
          waba_id: await plain("wa_waba_id"),
          display_phone: await plain("wa_display_phone"),
          mode: (await plain("wa_connection_mode")) || "cloud",
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
