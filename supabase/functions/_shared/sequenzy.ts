import { getSecret } from "./integrationSecrets.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

// SEQUENZY_API_BASE only exists so tests can point at a stand-in server
export const sequenzyBase = () =>
  (
    Deno.env.get("SEQUENZY_API_BASE") ?? "https://api.sequenzy.com/api/v1"
  ).replace(/\/$/, "");

export const sequenzyConfig = async () => ({
  apiKey: await getSecret("sequenzy_api_key"),
  listId: await getSecret("sequenzy_list_id"),
  enabled: (await getSecret("sequenzy_enabled")) === "1",
});

export const sequenzyFetch = (
  apiKey: string,
  path: string,
  init: RequestInit = {},
) =>
  fetch(`${sequenzyBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

/** Asks sequenzy_sync to send what is queued, without waiting for it. */
export async function kickSync() {
  const base = await getSecret("functions_url");
  const token = await getSecret("cron_token");
  if (!base || !token) return;
  await fetch(`${base}/sequenzy_sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-token": token },
    body: "{}",
  }).catch(() => undefined);
}

export const queueSize = async () => {
  const { count } = await supabaseAdmin
    .from("sequenzy_queue")
    .select("id", { count: "exact", head: true })
    .lt("attempts", 5);
  return count ?? 0;
};
