import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  normalizePhone,
  sendText,
  sendWelcome,
  whatsappConfigured,
} from "../_shared/whatsapp.ts";

// Staff sends a WhatsApp message to a company from its profile:
//   {company_id, text}      free text (works within 24 h of their last message)
//   {company_id, template}  the welcome template (can start a conversation)
//   {phone, text}           free text to a number that is not a company yet
//                           (someone who wrote to us first, from the inbox)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
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
        const companyId = Number(body.company_id);
        if (body.action === "link") {
          // attach earlier messages from a new number to the company just added
          const phone = normalizePhone(String(body.phone ?? ""));
          if (!companyId || !phone) {
            return createErrorResponse(400, "Missing company_id or phone");
          }
          const { error } = await supabaseAdmin
            .from("whatsapp_messages")
            .update({ company_id: companyId })
            .eq("phone", phone)
            .is("company_id", null);
          if (error) return createErrorResponse(500, error.message);
          return json({ status: "linked" });
        }
        const rawPhone = normalizePhone(String(body.phone ?? ""));
        if (!companyId && !rawPhone) {
          return createErrorResponse(400, "Missing company_id");
        }
        if (!(await whatsappConfigured())) {
          return createErrorResponse(
            500,
            "WhatsApp is not configured. An administrator can set it up in Settings.",
          );
        }

        if (!companyId) {
          // Only numbers that already wrote to us may be answered this way
          const { count } = await supabaseAdmin
            .from("whatsapp_messages")
            .select("id", { count: "exact", head: true })
            .eq("phone", rawPhone!)
            .eq("direction", "in");
          if (!count) {
            return createErrorResponse(
              400,
              "This number has not written to us. Add it as a company first.",
            );
          }
          const text = String(body.text ?? "").trim();
          if (!text) return createErrorResponse(400, "Message is empty");
          const { data: sale } = await supabaseAdmin
            .from("sales")
            .select("id")
            .eq("user_id", user!.id)
            .maybeSingle();
          const result = await sendText(rawPhone!, text);
          await supabaseAdmin.from("whatsapp_messages").insert({
            company_id: null,
            phone: rawPhone!,
            direction: "out",
            body: text,
            status: result.id ? "sent" : "failed",
            wa_message_id: result.id ?? null,
            error: result.error ?? null,
            sales_id: sale?.id ?? null,
          });
          if (result.error) {
            return createErrorResponse(
              502,
              `${result.error}. Free-text replies only work within 24 hours of their last message.`,
            );
          }
          return json({ status: "sent" });
        }

        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("id,name,phone_number,whatsapp_opted_out")
          .eq("id", companyId)
          .maybeSingle();
        if (!company) return createErrorResponse(404, "Company not found");
        if (company.whatsapp_opted_out) {
          return createErrorResponse(
            409,
            "This company asked not to be messaged",
          );
        }
        const phone = normalizePhone(company.phone_number);
        if (!phone)
          return createErrorResponse(
            400,
            "This company has no valid phone number",
          );

        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("id")
          .eq("user_id", user!.id)
          .maybeSingle();

        if (body.template) {
          const result = await sendWelcome({
            companyId,
            phone,
            name: company.name,
            salesId: sale?.id,
          });
          if (result.error) return createErrorResponse(502, result.error);
          return json({ status: "sent" });
        }

        const text = String(body.text ?? "").trim();
        if (!text) return createErrorResponse(400, "Message is empty");
        const result = await sendText(phone, text);
        await supabaseAdmin.from("whatsapp_messages").insert({
          company_id: companyId,
          phone,
          direction: "out",
          body: text,
          status: result.id ? "sent" : "failed",
          wa_message_id: result.id ?? null,
          error: result.error ?? null,
          sales_id: sale?.id ?? null,
        });
        if (result.error) {
          return createErrorResponse(
            502,
            `${result.error}. Free-text replies only work within 24 hours of their last message: use the template to start a new conversation.`,
          );
        }
        return json({ status: "sent" });
      }),
    ),
  ),
);
