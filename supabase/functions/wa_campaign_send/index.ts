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
  normalizePhone,
  sendTemplate,
  whatsappConfigured,
} from "../_shared/whatsapp.ts";

// WhatsApp campaigns: a template message sent in small daily batches.
// Safety rules enforced here, not in the browser:
//  - never to companies that opted out (STOP)
//  - never twice to the same number (any earlier WhatsApp message counts)
//  - at most daily_cap messages per rolling 24 hours across all campaigns
// Automatic campaigns are triggered every hour by pg_cron (run_wa_auto_campaigns),
// which calls this function with the x-cron-token header.
const CONCURRENCY = 5;
const MAX_BATCH = 250;

type Audience = {
  lead_source?: string;
  tag?: string;
  city?: string;
  country?: string;
  competitor?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

async function eligible(audience: Audience) {
  let query = supabaseAdmin
    .from("companies")
    .select("id,name,phone_number")
    .not("phone_number", "is", null)
    .eq("whatsapp_opted_out", false)
    .order("id");
  for (const key of ["lead_source", "city", "country", "competitor"] as const) {
    if (audience[key]) query = query.eq(key, audience[key]!);
  }
  if (audience.tag) query = query.contains("tags", [Number(audience.tag)]);
  const { data, error } = await query.limit(10000);
  if (error) throw error;

  // numbers that already received a WhatsApp message from us (failed ones can retry)
  const { data: sent } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("phone")
    .eq("direction", "out")
    .neq("status", "failed")
    .limit(100000);
  const already = new Set((sent ?? []).map((m) => m.phone));

  const seen = new Set<string>();
  return (data ?? []).flatMap((c) => {
    const phone = normalizePhone(c.phone_number);
    if (!phone || already.has(phone) || seen.has(phone)) return [];
    seen.add(phone);
    return [{ id: c.id as number, name: c.name as string, phone }];
  });
}

async function sentLast24h() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "out")
    .not("campaign_id", "is", null)
    .neq("status", "failed")
    .gte("created_at", since);
  return count ?? 0;
}

type Campaign = {
  id: number;
  template_name: string;
  template_language: string;
  with_name: boolean;
  audience: Audience | null;
  daily_cap: number;
  sales_id: number | null;
};

/** Sends the next batch of a campaign and reports what happened. */
async function runBatch(campaign: Campaign, salesId: number | null) {
  const room = campaign.daily_cap - (await sentLast24h());
  const all = await eligible(campaign.audience ?? {});
  if (room <= 0) {
    return {
      sent: 0,
      failed: 0,
      remaining: all.length,
      message: "Daily limit reached. Try again later today or tomorrow.",
    };
  }
  const batch = all.slice(0, Math.min(room, MAX_BATCH));
  if (batch.length === 0) {
    await supabaseAdmin
      .from("wa_campaigns")
      .update({ status: "done" })
      .eq("id", campaign.id);
    return { sent: 0, failed: 0, remaining: 0, message: "Done" };
  }

  // Log first so a double click cannot message the same number twice
  const { data: rows, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert(
      batch.map((t) => ({
        company_id: t.id,
        phone: t.phone,
        direction: "out",
        body: `[template: ${campaign.template_name}]`,
        template_name: campaign.template_name,
        status: "queued",
        campaign_id: campaign.id,
        sales_id: salesId,
      })),
    )
    .select("id,phone");
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("wa_campaigns")
    .update({ status: "active", error: null })
    .eq("id", campaign.id);

  const nameByPhone = new Map(batch.map((t) => [t.phone, t.name]));
  const queue = [...(rows ?? [])];
  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const result = await sendTemplate(row.phone, {
        name: campaign.template_name,
        language: campaign.template_language,
        bodyParams: campaign.with_name
          ? [nameByPhone.get(row.phone) ?? ""]
          : [],
      });
      if (result.id) sent++;
      else {
        failed++;
        firstError ??= result.error;
      }
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          status: result.id ? "sent" : "failed",
          wa_message_id: result.id ?? null,
          error: result.error ?? null,
        })
        .eq("id", row.id);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const remaining = all.length - batch.length;
  if (remaining === 0 && sent > 0) {
    await supabaseAdmin
      .from("wa_campaigns")
      .update({ status: "done" })
      .eq("id", campaign.id);
  }
  if (sent === 0 && firstError) {
    await supabaseAdmin
      .from("wa_campaigns")
      .update({ error: firstError })
      .eq("id", campaign.id);
  }
  return { sent, failed, remaining, error: firstError ?? null };
}

async function loadCampaign(id: number) {
  const { data } = await supabaseAdmin
    .from("wa_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as Campaign | null;
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    // Hourly call from pg_cron: no user, answer at once and send in the background
    const cronToken = req.headers.get("x-cron-token");
    if (cronToken) {
      const expected = await getSecret("cron_token");
      if (!expected || cronToken !== expected) {
        return createErrorResponse(401, "Invalid token");
      }
      const body = await req.json().catch(() => ({}));
      const campaign = await loadCampaign(Number(body.campaign_id));
      if (!campaign?.template_name || !(await whatsappConfigured())) {
        return json({ status: "skipped" });
      }
      EdgeRuntime.waitUntil(
        runBatch(campaign, campaign.sales_id).catch((e) =>
          console.error("wa_campaign_send cron", e),
        ),
      );
      return json({ status: "accepted" }, 202);
    }

    return AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const body = await req.json().catch(() => ({}));

        if (body.action === "preview") {
          const list = await eligible((body.audience ?? {}) as Audience);
          return json({ eligible: list.length, sent_24h: await sentLast24h() });
        }

        if (body.action === "arm") {
          // lets the hourly job find this function and prove who it is
          await setSecret(
            "functions_url",
            `${Deno.env.get("SUPABASE_URL")}/functions/v1`,
          );
          await getOrCreateSecret("cron_token");
          return json({ status: "armed" });
        }

        const campaignId = Number(body.campaign_id);
        if (!campaignId) return createErrorResponse(400, "Missing campaign_id");
        if (!(await whatsappConfigured())) {
          return createErrorResponse(
            500,
            "WhatsApp is not set up yet. An administrator can add it in Settings.",
          );
        }
        const campaign = await loadCampaign(campaignId);
        if (!campaign) return createErrorResponse(404, "Campaign not found");
        if (!campaign.template_name) {
          return createErrorResponse(400, "Choose the template name first");
        }
        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("id")
          .eq("user_id", user!.id)
          .maybeSingle();
        try {
          return json(await runBatch(campaign, sale?.id ?? null));
        } catch (e) {
          return createErrorResponse(
            500,
            e instanceof Error ? e.message : String(e),
          );
        }
      }),
    );
  }),
);
