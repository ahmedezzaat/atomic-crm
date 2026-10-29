import { RtcRole, RtcTokenBuilder } from "npm:agora-token@2.0.7";
import { getSecret } from "./integrationSecrets.ts";

const TOKEN_LIFETIME_SECONDS = 2 * 60 * 60;

export type AgoraCredentials = { appId: string; certificate: string };

/** Agora project credentials, saved by an administrator in Settings. */
export async function getAgoraCredentials(): Promise<AgoraCredentials | null> {
  const appId = await getSecret("agora_app_id", "AGORA_APP_ID");
  const certificate = await getSecret(
    "agora_app_certificate",
    "AGORA_APP_CERTIFICATE",
  );
  return appId && certificate ? { appId, certificate } : null;
}

/** A short-lived token that lets one user publish in one channel. */
export function buildRtcToken(
  { appId, certificate }: AgoraCredentials,
  channel: string,
  uid: number,
) {
  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    certificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    TOKEN_LIFETIME_SECONDS,
    TOKEN_LIFETIME_SECONDS,
  );
}

export const NOT_CONFIGURED =
  "Video calls are not configured. An administrator can add the Agora App ID and certificate in Settings.";
