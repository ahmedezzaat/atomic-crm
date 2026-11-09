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
//  - automatic sending only inside the campaign's sending window (Cairo time);
//    a person can send a batch by hand outside it
//  - follow-ups only to people who got the earlier message, did not reply,
//    did not opt out and have no open deal
// Automatic campaigns are triggered every hour of their window by pg_cron
// (run_wa_auto_campaigns), which calls this function with the x-cron-token
// header; each call sends that hour's share of what is left for the day.
const CONCURRENCY = 5;
const MAX_BATCH = 250;

type Audience = {
  lead_source?: string;
  tag?: string;
  city?: string;
  country?: string;
  competitor?: string;
  // only companies with no deal (open, won, lost or archived), no subscription
  // and not flagged as a customer
  new_only?: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

async function eligible(audience: Audience) {
  let query = supabaseAdmin
    .from("companies")
    .select("id,name,phone_number,is_customer")
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

  // companies that already have a deal or a subscription are not "new"
  const busy = new Set<number>();
  if (audience.new_only) {
    const [{ data: deals }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("deals").select("company_id").limit(100000),
      supabaseAdmin.from("subscriptions").select("company_id").limit(100000),
    ]);
    for (const d of deals ?? []) busy.add(d.company_id);
    for (const sub of subs ?? []) busy.add(sub.company_id);
  }

  const seen = new Set<string>();
  return (data ?? []).flatMap((c) => {
    if (audience.new_only && (c.is_customer || busy.has(c.id))) return [];
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

type Template = {
  template_name: string;
  template_language: string;
  with_name: boolean;
  header_image_url?: string;
};

type Followup = Template & { after_hours: number };

type Campaign = Template & {
  id: number;
  followups: Followup[] | null;
  audience: Audience | null;
  daily_cap: number;
  send_from_hour: number;
  send_to_hour: number;
  sales_id: number | null;
};

const cairoHour = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

const inWindow = (campaign: Campaign, hour = cairoHour()) =>
  hour >= campaign.send_from_hour && hour < campaign.send_to_hour;

const chunks = <T>(items: T[], size = 300) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

type Target = {
  id: number;
  name: string;
  phone: string;
  step: number;
  template: Template;
};

/**
 * Who should get a follow-up now (due) and how many may need one later (waiting).
 * A person gets follow-up N when follow-up N-1 (or the campaign message) was
 * delivered at least after_hours ago and they have not replied since the
 * campaign message, not opted out and have no open deal.
 */
async function followupState(campaign: Campaign) {
  const steps = (campaign.followups ?? []).filter((f) => f.template_name);
  const due: Target[] = [];
  let waiting = 0;
  if (steps.length === 0) return { due, waiting };

  const { data: rows } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("phone,company_id,created_at,status,followup_step")
    .eq("campaign_id", campaign.id)
    .eq("direction", "out")
    .neq("status", "failed")
    .limit(100000);
  type Row = NonNullable<typeof rows>[number];
  const byPhone = new Map<string, { first: Row; last: Row }>();
  for (const row of rows ?? []) {
    const entry = byPhone.get(row.phone);
    if (!entry) byPhone.set(row.phone, { first: row, last: row });
    else {
      if (row.followup_step < entry.first.followup_step) entry.first = row;
      if (row.followup_step > entry.last.followup_step) entry.last = row;
    }
  }
  const open = [...byPhone.entries()].filter(
    ([, e]) => e.last.followup_step < steps.length,
  );
  if (open.length === 0) return { due, waiting };

  const replied = new Set<string>();
  const companies = new Map<number, { name: string; opted_out: boolean }>();
  const busy = new Set<number>();
  const companyIds = [
    ...new Set(open.map(([, e]) => e.first.company_id).filter(Boolean)),
  ] as number[];
  for (const part of chunks(open)) {
    const { data } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("phone,created_at")
      .eq("direction", "in")
      .in(
        "phone",
        part.map(([phone]) => phone),
      );
    for (const m of data ?? []) {
      if (m.created_at > byPhone.get(m.phone)!.first.created_at)
        replied.add(m.phone);
    }
  }
  for (const part of chunks(companyIds)) {
    const [{ data: cs }, { data: deals }] = await Promise.all([
      supabaseAdmin
        .from("companies")
        .select("id,name,whatsapp_opted_out")
        .in("id", part),
      supabaseAdmin
        .from("deals")
        .select("company_id")
        .is("archived_at", null)
        .in("company_id", part),
    ]);
    for (const c of cs ?? [])
      companies.set(c.id, { name: c.name, opted_out: c.whatsapp_opted_out });
    for (const d of deals ?? []) busy.add(d.company_id);
  }

  const now = Date.now();
  for (const [phone, { first, last }] of open) {
    const company = companies.get(first.company_id);
    if (!company || company.opted_out || busy.has(first.company_id)) continue;
    if (replied.has(phone)) continue;
    const step = steps[last.followup_step];
    const age = now - new Date(last.created_at).getTime();
    if (last.status === "sent") {
      // not delivered (yet): wait for the delivery report, give up after a week
      if (age < 7 * 24 * 3600_000) waiting++;
      continue;
    }
    if (age < step.after_hours * 3600_000) {
      waiting++;
      continue;
    }
    due.push({
      id: first.company_id,
      name: company.name,
      phone,
      step: last.followup_step + 1,
      template: step,
    });
  }
  return { due, waiting };
}

/**
 * Sends the next batch of a campaign and reports what happened.
 * Follow-ups that are due go first, then companies not messaged yet.
 * With spread, sends only this hour's share of the room left for the day,
 * so an automatic campaign is spread evenly over its window.
 */
async function runBatch(
  campaign: Campaign,
  salesId: number | null,
  spread = false,
  ignoreHours = false,
) {
  const hour = cairoHour();
  const all = await eligible(campaign.audience ?? {});
  if (!ignoreHours && !inWindow(campaign, hour)) {
    return {
      sent: 0,
      failed: 0,
      remaining: all.length,
      message: `This campaign sends only between ${hourLabel(campaign.send_from_hour)} and ${hourLabel(campaign.send_to_hour)} Cairo time.`,
    };
  }
  let room = campaign.daily_cap - (await sentLast24h());
  if (spread && inWindow(campaign, hour))
    room = Math.ceil(room / (campaign.send_to_hour - hour));
  if (room <= 0) {
    return {
      sent: 0,
      failed: 0,
      remaining: all.length,
      message: "Daily limit reached. Try again later today or tomorrow.",
    };
  }
  room = Math.min(room, MAX_BATCH);
  const followups = await followupState(campaign);
  const main: Template = campaign;
  const batch: Target[] = [
    ...followups.due.slice(0, room),
    ...all
      .slice(0, Math.max(0, room - followups.due.length))
      .map((t) => ({ ...t, step: 0, template: main })),
  ];
  const stepsCount = (campaign.followups ?? []).filter(
    (f) => f.template_name,
  ).length;
  if (batch.length === 0) {
    if (all.length === 0 && followups.waiting === 0) {
      await supabaseAdmin
        .from("wa_campaigns")
        .update({ status: "done" })
        .eq("id", campaign.id);
      return { sent: 0, failed: 0, remaining: 0, message: "Done" };
    }
    return {
      sent: 0,
      failed: 0,
      remaining: all.length,
      message: `Nothing to send now. ${followups.waiting} waiting for a follow-up.`,
    };
  }

  // Log first so a double click cannot message the same number twice
  const { data: rows, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert(
      batch.map((t) => ({
        company_id: t.id,
        phone: t.phone,
        direction: "out",
        body: `[template: ${t.template.template_name}]`,
        template_name: t.template.template_name,
        status: "queued",
        campaign_id: campaign.id,
        followup_step: t.step,
        sales_id: salesId,
      })),
    )
    .select("id,phone");
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("wa_campaigns")
    .update({ status: "active", error: null })
    .eq("id", campaign.id);

  // one message per phone in a batch
  const targetByPhone = new Map(batch.map((t) => [t.phone, t]));
  const queue = [...(rows ?? [])];
  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const target = targetByPhone.get(row.phone)!;
      const result = await sendTemplate(row.phone, {
        name: target.template.template_name,
        language: target.template.template_language,
        bodyParams: target.template.with_name ? [target.name] : [],
        headerImage: target.template.header_image_url || undefined,
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

  const newSent = batch.filter((t) => t.step === 0).length;
  const remaining = all.length - newSent;
  const moreFollowups =
    followups.waiting > 0 ||
    followups.due.length > batch.length - newSent ||
    batch.some((t) => t.step < stepsCount);
  if (remaining === 0 && sent > 0 && !moreFollowups) {
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
        runBatch(campaign, campaign.sales_id, true).catch((e) =>
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
          const saved = body.campaign_id
            ? await loadCampaign(Number(body.campaign_id))
            : null;
          const followups = saved
            ? await followupState(saved)
            : { due: [], waiting: 0 };
          return json({
            eligible: list.length,
            sent_24h: await sentLast24h(),
            followups_due: followups.due.length,
            followups_waiting: followups.waiting,
          });
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
          // a person clicking "send now" may go outside the hours; automatic sending never does
          return json(
            await runBatch(
              campaign,
              sale?.id ?? null,
              false,
              body.ignore_hours === true,
            ),
          );
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
