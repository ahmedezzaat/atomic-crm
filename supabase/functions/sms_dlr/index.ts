import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getSecret } from "../_shared/integrationSecrets.ts";

// Cequens delivery receipts (DLR): POST with query parameters
// msgid, ClientMsgID, statusid (1 = delivered, 2 = undelivered), statusmsg.
// Called as /functions/v1/sms_dlr?token=<sms_dlr_token> (set as dlrUrl on send).
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const expected = await getSecret("sms_dlr_token", "SMS_DLR_TOKEN");
  if (!expected || url.searchParams.get("token") !== expected) {
    return new Response("{}", { status: 401 });
  }

  const msgid = url.searchParams.get("msgid");
  const statusId = Number(url.searchParams.get("statusid"));
  const statusMsg = url.searchParams.get("statusmsg");
  if (!msgid || ![1, 2].includes(statusId)) {
    return new Response("{}", { status: 400 });
  }

  await supabaseAdmin
    .from("sms_messages")
    .update({
      status: statusId === 1 ? "delivered" : "undelivered",
      error: statusId === 2 ? statusMsg : null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_message_id", msgid);

  return new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
