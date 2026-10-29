import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  buildRtcToken,
  getAgoraCredentials,
  NOT_CONFIGURED,
} from "../_shared/agora.ts";

// Public endpoint for the person being called (no CRM login). The secret
// guest_key in the link is the only credential, and only works until the call
// is ended by staff.
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }
    const { guest_key } = await req.json().catch(() => ({}));
    if (typeof guest_key !== "string" || guest_key.length < 16) {
      return createErrorResponse(400, "Invalid link");
    }

    const { data: call } = await supabaseAdmin
      .from("calls")
      .select("id,title,channel,status,company_id")
      .eq("guest_key", guest_key)
      .maybeSingle();
    if (!call) return createErrorResponse(404, "This call link is not valid");
    if (call.status === "ended") {
      return createErrorResponse(410, "This call has ended");
    }

    const credentials = await getAgoraCredentials();
    if (!credentials) return createErrorResponse(500, NOT_CONFIGURED);

    if (call.status === "scheduled") {
      await supabaseAdmin
        .from("calls")
        .update({ status: "active", started_at: new Date().toISOString() })
        .eq("id", call.id);
    }

    // Guests get a uid well above the range of CRM ids
    const uid = 1_000_000 + Math.floor(Math.random() * 1_000_000_000);
    return json({
      appId: credentials.appId,
      channel: call.channel,
      uid,
      token: buildRtcToken(credentials, call.channel, uid),
      title: call.title,
    });
  }),
);
