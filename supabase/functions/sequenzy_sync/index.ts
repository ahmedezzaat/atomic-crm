import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getSecret } from "../_shared/integrationSecrets.ts";
import {
  kickSync,
  sequenzyConfig,
  sequenzyFetch,
} from "../_shared/sequenzy.ts";

// Sends queued emails to the chosen Sequenzy list. Called by the database
// (trigger, and every 5 minutes for retries) with the x-cron-token header.
// People who unsubscribed in Sequenzy are never re-activated: existing
// subscribers are only filled in ("merge") and no sequences are triggered.
const PER_RUN = 200;
const MAX_ATTEMPTS = 5;

async function drain() {
  const { apiKey, listId, enabled } = await sequenzyConfig();
  if (!enabled || !apiKey || !listId) return;

  const { data: rows } = await supabaseAdmin
    .from("sequenzy_queue")
    .select("*")
    .lt("attempts", MAX_ATTEMPTS)
    .order("id")
    .limit(PER_RUN);

  for (const row of rows ?? []) {
    try {
      const res = await sequenzyFetch(apiKey, "/subscribers", {
        method: "POST",
        body: JSON.stringify({
          email: row.email,
          ...(row.first_name ? { firstName: row.first_name } : {}),
          ...(row.last_name ? { lastName: row.last_name } : {}),
          lists: [listId],
          tags: ["kords-crm", `kords-${row.source}`],
          customAttributes: {
            ...(row.company ? { company: row.company } : {}),
            source: `Kords CRM (${row.source})`,
          },
          duplicateStrategy: "merge",
          enrollInSequences: false,
        }),
      });
      if (res.status === 429) {
        console.error("sequenzy_sync: rate limited, will retry");
        return;
      }
      if (res.ok) {
        await supabaseAdmin.from("sequenzy_queue").delete().eq("id", row.id);
      } else {
        const detail = await res.text().catch(() => "");
        await supabaseAdmin
          .from("sequenzy_queue")
          .update({
            attempts: row.attempts + 1,
            last_error: `${res.status} ${detail}`.slice(0, 300),
          })
          .eq("id", row.id);
      }
    } catch (e) {
      await supabaseAdmin
        .from("sequenzy_queue")
        .update({
          attempts: row.attempts + 1,
          last_error: String((e as Error).message ?? e).slice(0, 300),
        })
        .eq("id", row.id);
    }
  }

  // more waiting than one run handles: go again
  if ((rows?.length ?? 0) === PER_RUN) await kickSync();
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    const token = req.headers.get("x-cron-token");
    const expected = await getSecret("cron_token");
    if (!token || !expected || token !== expected) {
      return createErrorResponse(401, "Invalid token");
    }
    EdgeRuntime.waitUntil(
      drain().catch((e) => console.error("sequenzy_sync", e)),
    );
    return new Response(JSON.stringify({ status: "started" }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
);
