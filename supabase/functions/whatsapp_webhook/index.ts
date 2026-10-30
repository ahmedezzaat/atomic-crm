import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getSecret } from "../_shared/integrationSecrets.ts";
import { normalizePhone } from "../_shared/whatsapp.ts";

// Meta WhatsApp webhook. GET answers Meta's verification handshake; POST
// delivers customer replies and delivery statuses, signed with the app secret.
const OPT_OUT = /^(stop|unsubscribe|cancel|إلغاء|ايقاف|إيقاف|وقف)$/i;

async function validSignature(raw: string, header: string | null) {
  const secret = await getSecret("wa_app_secret");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  const expected = [...signature]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // constant-time comparison
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

const STATUS_MAP: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

async function handleMessage(message: any) {
  const phone = normalizePhone(message.from);
  if (!phone) return;
  const text =
    message.type === "text"
      ? String(message.text?.body ?? "")
      : message.type === "button"
        ? String(message.button?.text ?? "")
        : `[${message.type}]`;

  // The customer is matched to a company by phone number
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id,name,sales_id,phone_number")
    .not("phone_number", "is", null)
    .limit(5000);
  const company = (companies ?? []).find(
    (c) => normalizePhone(c.phone_number) === phone,
  );

  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    company_id: company?.id ?? null,
    phone,
    direction: "in",
    body: text,
    status: "received",
    wa_message_id: message.id,
  });
  if (error) {
    // 23505: Meta delivered this message twice; nothing more to do
    if (error.code !== "23505") console.error("whatsapp_webhook insert", error);
    return;
  }
  if (!company) return;

  if (OPT_OUT.test(text.trim())) {
    await supabaseAdmin
      .from("companies")
      .update({ whatsapp_opted_out: true })
      .eq("id", company.id);
    return;
  }

  // A reply needs a human: task for the account manager, due now
  await supabaseAdmin.from("tasks").insert({
    company_id: company.id,
    sales_id: company.sales_id,
    type: "none",
    text: `Reply on WhatsApp to ${company.name}: ${text.slice(0, 120)}`,
    due_date: new Date().toISOString(),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const expected = await getSecret("wa_verify_token");
    if (
      expected &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === expected
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", {
        status: 200,
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("", { status: 405 });
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const payload = JSON.parse(raw);
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        for (const message of value.messages ?? [])
          await handleMessage(message);
        for (const status of value.statuses ?? []) {
          const mapped = STATUS_MAP[status.status];
          if (!mapped || !status.id) continue;
          const error = status.errors?.[0];
          await supabaseAdmin
            .from("whatsapp_messages")
            .update({
              status: mapped,
              error: error ? `${error.code}: ${error.title}` : null,
            })
            .eq("wa_message_id", status.id);
        }
      }
    }
  } catch (e) {
    console.error("whatsapp_webhook", e);
  }
  // Always 200 once the signature is valid, so Meta does not keep retrying
  return new Response("OK", { status: 200 });
});
