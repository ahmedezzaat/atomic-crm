import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getOrCreateSecret, getSecret } from "../_shared/integrationSecrets.ts";

// Cequens SMS API: https://developer.cequens.com/reference/sending-sms
// Credentials are saved by an administrator in Settings (see sms_settings):
// an access token, or a username + API key the function signs in with.
// Optional: SMS_DRY_RUN=true (no real SMS, for testing)
const AUTH_URL = "https://apis.cequens.com/auth/v1/tokens/";
const SMS_URL = "https://apis.cequens.com/sms/v1/messages";
const DRY_RUN = Deno.env.get("SMS_DRY_RUN") === "true";
const CONCURRENCY = 8;

type Audience = Record<string, string | undefined>;

let cachedToken: string | undefined;

async function getToken(force = false) {
  const fixedToken = await getSecret("cequens_token", "CEQUENS_TOKEN");
  if (fixedToken) return fixedToken;
  if (cachedToken && !force) return cachedToken;
  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: await getSecret("cequens_username", "CEQUENS_USERNAME"),
      apiKey: await getSecret("cequens_api_key", "CEQUENS_API_KEY"),
    }),
  });
  const json = await response.json().catch(() => ({}));
  const token = json?.data?.access_token;
  if (!response.ok || !token) {
    throw new Error(
      `Cequens sign-in failed: ${json?.replyMessage ?? response.status}`,
    );
  }
  cachedToken = token;
  return token as string;
}

// Egyptian numbers are stored like +201090119009; Cequens expects digits only,
// with the country code.
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^01\d{9}$/.test(digits)) digits = "2" + digits;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function fill(message: string, values: { name: string; city: string }) {
  return message
    .replace(/\{\{\s*name\s*\}\}/gi, values.name)
    .replace(/\{\{\s*city\s*\}\}/gi, values.city);
}

// deliveryTime format is not documented by Cequens; yyyy-MM-dd HH:mm:ss (UTC)
// is used until confirmed against the real account.
function formatDeliveryTime(iso: string) {
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

// Cequens "unicode" messages carry the text as UCS-2 (UTF-16 big-endian) hex,
// e.g. "مرحبا" -> "06450631062D06280627". Plain text is sent as is.
export function toUcs2Hex(text: string): string {
  let hex = "";
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return hex;
}

async function sendOne(opts: {
  body: string;
  sender: string;
  phone: string;
  clientMessageId: number;
  scheduleAt: string | null;
  dlrUrl: string;
}): Promise<{ id?: string; error?: string }> {
  if (DRY_RUN) return { id: `dry-${crypto.randomUUID()}` };

  const unicode = [...opts.body].some((ch) => ch.charCodeAt(0) > 127);
  const payload: Record<string, unknown> = {
    messageText: unicode ? toUcs2Hex(opts.body) : opts.body,
    senderName: opts.sender,
    messageType: unicode ? "unicode" : "text",
    recipients: opts.phone,
    clientMessageId: opts.clientMessageId,
    dlrUrl: opts.dlrUrl,
  };
  if (opts.scheduleAt)
    payload.deliveryTime = formatDeliveryTime(opts.scheduleAt);

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    const response = await fetch(SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 401 && attempt === 0) continue;
    const json = await response.json().catch(() => ({}));
    if (response.ok && json?.replyCode === 0) {
      const id = json?.data?.SentSMSIDs?.[0]?.SMSId;
      return id ? { id } : { error: "No message id returned" };
    }
    const detail = json?.error?.internalErrors?.[0];
    // Keep Cequens' request id so their support can trace a rejected message
    const reason = detail
      ? `${detail.code}: ${detail.details}`
      : (json?.replyMessage ?? `HTTP ${response.status}`);
    return {
      error: json?.requestId ? `${reason} (request ${json.requestId})` : reason,
    };
  }
  return { error: "Unauthorized" };
}

async function runCampaign(campaignId: number) {
  const { data: campaign } = await supabaseAdmin
    .from("sms_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!campaign) return;

  try {
    // Resolve the audience on the server so the list can't be tampered with
    const audience = (campaign.audience ?? {}) as Audience;
    let query = supabaseAdmin
      .from("companies")
      .select("id,name,city,phone_number")
      .not("phone_number", "is", null);
    for (const key of ["city", "sector", "competitor"]) {
      if (audience[key]) query = query.eq(key, audience[key]!);
    }
    if (audience.size) query = query.eq("size", Number(audience.size));
    // single-company messages sent from a company profile
    if (audience.company_id)
      query = query.eq("id", Number(audience.company_id));
    const { data: companies, error } = await query.limit(5000);
    if (error) throw error;

    const seen = new Set<string>();
    const targets = (companies ?? []).flatMap((c) => {
      const phone = normalizePhone(c.phone_number);
      if (!phone || seen.has(phone)) return [];
      seen.add(phone);
      return [{ company: c, phone }];
    });
    if (targets.length === 0)
      throw new Error("No recipients with a valid phone number");

    // Retrying a campaign where nothing was accepted: drop the old attempts
    await supabaseAdmin
      .from("sms_messages")
      .delete()
      .eq("campaign_id", campaignId)
      .in("status", ["failed", "pending"]);

    const { data: rows, error: insertError } = await supabaseAdmin
      .from("sms_messages")
      .insert(
        targets.map(({ company, phone }) => ({
          campaign_id: campaignId,
          company_id: company.id,
          phone,
          body: fill(campaign.message, {
            name: company.name ?? "",
            city: company.city ?? "",
          }),
        })),
      )
      .select("id,phone,body");
    if (insertError) throw insertError;

    const dlrUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sms_dlr?token=${await getOrCreateSecret("sms_dlr_token")}`;
    const queue = [...(rows ?? [])];
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const result = await sendOne({
          body: row.body,
          sender: campaign.sender_id,
          phone: row.phone,
          clientMessageId: row.id,
          scheduleAt: campaign.schedule_at,
          dlrUrl,
        });
        await supabaseAdmin
          .from("sms_messages")
          .update({
            status: result.id ? "sent" : "failed",
            provider_message_id: result.id ?? null,
            error: result.error ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // A campaign only counts as sent when at least one message was accepted
    const { data: results } = await supabaseAdmin
      .from("sms_messages")
      .select("status,error")
      .eq("campaign_id", campaignId);
    const accepted = (results ?? []).filter((m) => m.status !== "failed");
    const firstError = (results ?? []).find((m) => m.error)?.error;
    await supabaseAdmin
      .from("sms_campaigns")
      .update(
        accepted.length > 0
          ? {
              status: "sent",
              recipients: targets.length,
              sent_at: new Date().toISOString(),
              error: null,
            }
          : {
              status: "failed",
              recipients: targets.length,
              error: `No message was accepted by the SMS provider (${firstError ?? "unknown error"})`,
            },
      )
      .eq("id", campaignId);
  } catch (e) {
    await supabaseAdmin
      .from("sms_campaigns")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      })
      .eq("id", campaignId);
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const { campaign_id } = await req.json().catch(() => ({}));
        if (!campaign_id)
          return createErrorResponse(400, "Missing campaign_id");
        if (
          !DRY_RUN &&
          !(await getSecret("cequens_token", "CEQUENS_TOKEN")) &&
          !(
            (await getSecret("cequens_username", "CEQUENS_USERNAME")) &&
            (await getSecret("cequens_api_key", "CEQUENS_API_KEY"))
          )
        ) {
          return createErrorResponse(
            500,
            "SMS provider is not configured. An administrator can add the API token in Settings.",
          );
        }

        // Claim the campaign so it can't be sent twice
        const { data: claimed } = await supabaseAdmin
          .from("sms_campaigns")
          .update({ status: "sending", error: null })
          .eq("id", campaign_id)
          .in("status", ["draft", "scheduled", "failed"])
          .select("id")
          .maybeSingle();
        if (!claimed) {
          return createErrorResponse(409, "Campaign already sent or sending");
        }

        // Respond straight away; the sending continues in the background
        EdgeRuntime.waitUntil(runCampaign(campaign_id));
        return new Response(JSON.stringify({ status: "sending" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }),
    ),
  ),
);
