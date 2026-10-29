import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  buildRtcToken,
  getAgoraCredentials,
  NOT_CONFIGURED,
} from "../_shared/agora.ts";

// Staff side of calls: create a call, join it (get an Agora token) and end it.
// Guests join through call_guest with the secret guest_key instead.
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
        const body = await req.json().catch(() => ({}));

        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("id,first_name,last_name")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (!sale) return createErrorResponse(403, "No CRM account");

        if (body.action === "create") {
          const credentials = await getAgoraCredentials();
          if (!credentials) return createErrorResponse(500, NOT_CONFIGURED);
          const { data: call, error } = await supabaseAdmin
            .from("calls")
            .insert({
              title: String(body.title ?? "").slice(0, 200),
              company_id: body.company_id ?? null,
              contact_id: body.contact_id ?? null,
              channel: `kords-${crypto.randomUUID().replaceAll("-", "")}`,
              guest_key: crypto.randomUUID().replaceAll("-", ""),
              recording: body.recording !== false,
              sales_id: sale.id,
            })
            .select("*")
            .single();
          if (error) return createErrorResponse(500, error.message);
          return json({ call });
        }

        const callId = Number(body.call_id);
        if (!callId) return createErrorResponse(400, "Missing call_id");
        const { data: call } = await supabaseAdmin
          .from("calls")
          .select("*")
          .eq("id", callId)
          .maybeSingle();
        if (!call) return createErrorResponse(404, "Call not found");

        if (body.action === "end") {
          await supabaseAdmin
            .from("calls")
            .update({ status: "ended", ended_at: new Date().toISOString() })
            .eq("id", callId);
          return json({ status: "ended" });
        }

        if (body.action === "join") {
          if (call.status === "ended") {
            return createErrorResponse(410, "This call has ended");
          }
          const credentials = await getAgoraCredentials();
          if (!credentials) return createErrorResponse(500, NOT_CONFIGURED);
          if (call.status === "scheduled") {
            await supabaseAdmin
              .from("calls")
              .update({
                status: "active",
                started_at: new Date().toISOString(),
              })
              .eq("id", callId);
          }
          // Agora uids are unsigned 32-bit numbers; staff use their CRM id
          const uid = sale.id as number;
          return json({
            appId: credentials.appId,
            channel: call.channel,
            uid,
            token: buildRtcToken(credentials, call.channel, uid),
            name: `${sale.first_name} ${sale.last_name}`.trim(),
            recording: call.recording,
          });
        }

        return createErrorResponse(400, "Unknown action");
      }),
    ),
  ),
);
