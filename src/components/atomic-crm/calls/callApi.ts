import type { Identifier } from "ra-core";

import { getSupabaseClient } from "../providers/supabase/supabase";

export type CallCredentials = {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  name?: string;
  title?: string;
  recording?: boolean;
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
  recording: boolean;
  recording_path: string | null;
  processing_status:
    | "none"
    | "uploading"
    | "transcribing"
    | "summarizing"
    | "done"
    | "failed";
  processing_error: string | null;
  transcript: string | null;
  summary: string | null;
  key_points: string[];
  action_items: string[];
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
  recording?: boolean;
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

/** Public: what the guest should know before joining (is it recorded?). */
export const guestCallInfo = (guestKey: string) =>
  invoke<{ title: string; recording: boolean }>("call_guest", {
    guest_key: guestKey,
    info: true,
  });

/** Uploads the host's recording, then starts transcription and the summary. */
export async function uploadAndProcessRecording(
  callId: Identifier,
  blob: Blob,
  extension: string,
) {
  const supabase = getSupabaseClient();
  const path = `${callId}/recording.${extension}`;
  const { error } = await supabase.storage
    .from("call-recordings")
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw new Error(`Could not save the recording: ${error.message}`);
  await supabase
    .from("calls")
    .update({ recording_path: path, processing_status: "uploading" })
    .eq("id", callId);
  return processCall(callId);
}

export const processCall = (callId: Identifier) =>
  invoke<{ status: string }>("call_process", { call_id: callId });

export const recordingUrl = async (path: string) => {
  const { data } = await getSupabaseClient()
    .storage.from("call-recordings")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
};
