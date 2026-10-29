import type { Identifier } from "ra-core";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type CallCredentials = {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  name?: string;
  title?: string;
};

export type CallRecord = {
  id: number;
  title: string;
  company_id: number | null;
  contact_id: number | null;
  channel: string;
  guest_key: string;
  status: "scheduled" | "active" | "ended";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

async function invoke<T>(name: string, body: Record<string, unknown>) {
  const { data, error } = await getSupabaseClient().functions.invoke<T>(name, {
    method: "POST",
    body,
  });
  if (error) {
    const detail = await (error as any).context?.json?.().catch(() => null);
    throw new Error(detail?.message ?? error.message);
  }
  return data as T;
}

export const startCall = (input: {
  title: string;
  company_id?: Identifier;
  contact_id?: Identifier;
}) =>
  invoke<{ call: CallRecord }>("call_start", { action: "create", ...input });

export const joinCall = (callId: Identifier) =>
  invoke<CallCredentials>("call_start", { action: "join", call_id: callId });

export const endCall = (callId: Identifier) =>
  invoke<{ status: string }>("call_start", { action: "end", call_id: callId });

export const joinAsGuest = (guestKey: string) =>
  invoke<CallCredentials>("call_guest", { guest_key: guestKey });

/** The link to send to the person being called. */
export const guestLink = (call: Pick<CallRecord, "guest_key">) =>
  `${window.location.origin}${window.location.pathname}#/call/${call.guest_key}`;
