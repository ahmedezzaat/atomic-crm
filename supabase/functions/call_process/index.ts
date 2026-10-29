import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getSecret } from "../_shared/integrationSecrets.ts";

// After a call: the recording is transcribed with OpenAI Whisper, then Claude
// writes a summary, key points and action items. Everything is written to the
// call record. Keys are saved by an administrator in Settings.
// The URLs can be overridden in tests with a local stand-in server
const WHISPER_URL =
  Deno.env.get("OPENAI_TRANSCRIBE_URL") ??
  "https://api.openai.com/v1/audio/transcriptions";
const CLAUDE_URL =
  Deno.env.get("ANTHROPIC_MESSAGES_URL") ??
  "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-5-5";

const SYSTEM_PROMPT = `You summarise recorded sales and support calls for a CRM.
The transcript may be Arabic (including Egyptian dialect), English or a mix, and may contain recognition mistakes.
Reply with ONLY a JSON object, no other text:
{"summary": string, "key_points": string[], "action_items": string[]}
- summary: 2-4 sentences on what the call was about and its outcome.
- key_points: the important facts, needs, objections or decisions (max 8).
- action_items: concrete follow-ups, each saying who should do what and by when if mentioned (max 8). Empty array if none.
Write in the same language the call was mostly spoken in. Do not invent anything that was not said.`;

async function transcribe(audio: Blob, fileName: string, apiKey: string) {
  const form = new FormData();
  form.append(
    "file",
    new File([audio], fileName, { type: audio.type || "audio/webm" }),
  );
  form.append("model", "whisper-1");
  const response = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Transcription failed: ${json?.error?.message ?? response.status}`,
    );
  }
  return String(json.text ?? "").trim();
}

async function summarise(transcript: string, apiKey: string) {
  const response = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Transcript:\n\n${transcript}` }],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Summary failed: ${json?.error?.message ?? response.status}`,
    );
  }
  const text: string =
    json?.content?.find((b: any) => b.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Summary failed: unexpected reply format");
  const parsed = JSON.parse(match[0]);
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  return {
    summary: String(parsed.summary ?? "").trim(),
    key_points: list(parsed.key_points),
    action_items: list(parsed.action_items),
  };
}

async function processCall(callId: number, path: string) {
  const fail = (message: string) =>
    supabaseAdmin
      .from("calls")
      .update({ processing_status: "failed", processing_error: message })
      .eq("id", callId);

  try {
    const openaiKey = await getSecret("openai_api_key", "OPENAI_API_KEY");
    const anthropicKey = await getSecret(
      "anthropic_api_key",
      "ANTHROPIC_API_KEY",
    );
    if (!openaiKey || !anthropicKey) {
      return await fail(
        "Transcription and summaries are not configured. An administrator can add the OpenAI and Anthropic keys in Settings.",
      );
    }

    const { data: audio, error } = await supabaseAdmin.storage
      .from("call-recordings")
      .download(path);
    if (error || !audio) return await fail("Recording file not found");
    if (audio.size > 24 * 1024 * 1024) {
      return await fail("Recording is too long to transcribe (over 24 MB)");
    }

    const transcript = await transcribe(
      audio,
      path.split("/").pop() ?? "recording.webm",
      openaiKey,
    );
    if (!transcript) {
      await supabaseAdmin
        .from("calls")
        .update({
          transcript: "",
          summary: "No speech was detected in the recording.",
          key_points: [],
          action_items: [],
          processing_status: "done",
          processing_error: null,
        })
        .eq("id", callId);
      return;
    }
    await supabaseAdmin
      .from("calls")
      .update({ transcript, processing_status: "summarizing" })
      .eq("id", callId);

    const result = await summarise(transcript, anthropicKey);
    await supabaseAdmin
      .from("calls")
      .update({ ...result, processing_status: "done", processing_error: null })
      .eq("id", callId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : String(e));
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        const { call_id } = await req.json().catch(() => ({}));
        const callId = Number(call_id);
        if (!callId) return createErrorResponse(400, "Missing call_id");

        const { data: call } = await supabaseAdmin
          .from("calls")
          .select("id,recording_path,processing_status")
          .eq("id", callId)
          .maybeSingle();
        if (!call) return createErrorResponse(404, "Call not found");
        if (!call.recording_path) {
          return createErrorResponse(400, "This call has no recording");
        }
        if (["transcribing", "summarizing"].includes(call.processing_status)) {
          return createErrorResponse(409, "Already being processed");
        }

        await supabaseAdmin
          .from("calls")
          .update({ processing_status: "transcribing", processing_error: null })
          .eq("id", callId);
        EdgeRuntime.waitUntil(processCall(callId, call.recording_path));
        return new Response(JSON.stringify({ status: "transcribing" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }),
    ),
  ),
);
