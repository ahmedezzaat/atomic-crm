import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getSecret, setSecret } from "../_shared/integrationSecrets.ts";

// Administrators save the SMS provider credentials here. The values are write
// only: the app only ever learns whether they are set and their last 4 characters.
const FIELDS = {
  token: "cequens_token",
  api_key: "cequens_api_key",
  username: "cequens_username",
} as const;

const hint = (value?: string) =>
  value ? { set: true, hint: value.slice(-4) } : { set: false, hint: "" };

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("administrator")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (!sale?.administrator) {
          return createErrorResponse(403, "Only administrators can do this");
        }

        const body = await req.json().catch(() => ({}));
        if (body.action === "save") {
          for (const [field, key] of Object.entries(FIELDS)) {
            const value = body[field];
            if (typeof value === "string" && value.trim() !== "") {
              await setSecret(key, value.trim());
            }
          }
        }

        const status = {
          token: hint(await getSecret(FIELDS.token, "CEQUENS_TOKEN")),
          api_key: hint(await getSecret(FIELDS.api_key, "CEQUENS_API_KEY")),
          username: hint(await getSecret(FIELDS.username, "CEQUENS_USERNAME")),
        };
        return new Response(JSON.stringify(status), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }),
    ),
  ),
);
