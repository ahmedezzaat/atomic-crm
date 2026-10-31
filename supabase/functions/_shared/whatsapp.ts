import { supabaseAdmin } from "./supabaseAdmin.ts";
import { getSecret } from "./integrationSecrets.ts";

// Meta WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
// The base URL and dry-run switch exist only so tests can run without Meta.
export const API_BASE =
  Deno.env.get("WA_API_BASE") ?? "https://graph.facebook.com/v21.0";
export const WA_DRY_RUN = Deno.env.get("WA_DRY_RUN") === "true";

/** Digits only, with country code (Egyptian 01xxxxxxxxx becomes 201xxxxxxxxx). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^01\d{9}$/.test(digits)) digits = "2" + digits;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export async function whatsappConfigured() {
  if (WA_DRY_RUN) return true;
  return !!(
    (await getSecret("wa_access_token")) &&
    (await getSecret("wa_phone_number_id"))
  );
}

type SendResult = { id?: string; error?: string };

async function post(payload: Record<string, unknown>): Promise<SendResult> {
  if (WA_DRY_RUN) return { id: `wamid.dry-${crypto.randomUUID()}` };
  const token = await getSecret("wa_access_token");
  const phoneId = await getSecret("wa_phone_number_id");
  if (!token || !phoneId) return { error: "WhatsApp is not configured" };

  const response = await fetch(`${API_BASE}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const json = await response.json().catch(() => ({}));
  const id = json?.messages?.[0]?.id;
  if (response.ok && id) return { id };
  const err = json?.error;
  return {
    error: err
      ? `${err.code ?? response.status}: ${err.error_data?.details ?? err.message}`
      : `HTTP ${response.status}`,
  };
}

/** Template message: the only kind allowed to start a conversation. */
export async function sendTemplate(
  to: string,
  template: { name: string; language: string; bodyParams?: string[] },
) {
  return await post({
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(template.bodyParams?.length
        ? {
            components: [
              {
                type: "body",
                parameters: template.bodyParams.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          }
        : {}),
    },
  });
}

/** Free text: only delivered within 24 hours of the customer's last message. */
export async function sendText(to: string, body: string) {
  return await post({ to, type: "text", text: { body, preview_url: false } });
}

/** Sends the welcome template and logs it on the company. */
export async function sendWelcome(opts: {
  companyId: number;
  phone: string;
  name: string;
  salesId?: number | null;
}) {
  const name = await getSecret("wa_template_name");
  if (!name && !WA_DRY_RUN) return { error: "No welcome template is set" };
  const language = (await getSecret("wa_template_language")) ?? "ar";
  const withName = (await getSecret("wa_template_has_name")) !== "no";
  const result = await sendTemplate(opts.phone, {
    name: name ?? "welcome",
    language,
    bodyParams: withName ? [opts.name] : [],
  });
  await supabaseAdmin.from("whatsapp_messages").insert({
    company_id: opts.companyId,
    phone: opts.phone,
    direction: "out",
    body: `[template: ${name ?? "welcome"}]`,
    template_name: name ?? "welcome",
    status: result.id ? "sent" : "failed",
    wa_message_id: result.id ?? null,
    error: result.error ?? null,
    sales_id: opts.salesId ?? null,
  });
  return result;
}
