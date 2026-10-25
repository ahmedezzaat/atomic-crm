import { supabaseAdmin } from "./supabaseAdmin.ts";

/** Reads a stored credential, falling back to an environment secret. */
export async function getSecret(
  key: string,
  envName?: string,
): Promise<string | undefined> {
  const { data } = await supabaseAdmin
    .from("integration_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (
    data?.value || (envName ? Deno.env.get(envName) : undefined) || undefined
  );
}

export async function setSecret(key: string, value: string) {
  const { error } = await supabaseAdmin
    .from("integration_secrets")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** A random secret that is created the first time it is needed. */
export async function getOrCreateSecret(key: string): Promise<string> {
  const existing = await getSecret(key);
  if (existing) return existing;
  const value = crypto.randomUUID().replaceAll("-", "");
  await setSecret(key, value);
  return value;
}
