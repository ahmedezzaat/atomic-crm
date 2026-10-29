import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  IAgoraRTC,
  IAgoraRTCClient,
  ICameraVideoTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import { Button } from "@/components/ui/button";

import { uploadAndProcessRecording, type CallCredentials } from "./callApi";
import { CallRecorder } from "./callRecorder";

type Props = {
  credentials: CallCredentials;
  withCamera: boolean;
  onLeave: () => void;
  /** Shown to the host only: ends the call for everyone and kills the link */
  onEnd?: () => void;
  /** The host's browser records the call; guests only see the indicator */
  recording?: boolean;
  /** Set for the host: the recording is saved and summarised for this call */
  hostCallId?: number;
};

/**
 * 1-to-1 voice/video room on Agora. Screen sharing swaps the camera for the
 * screen (a client can publish one video track), and swaps back when stopped.
 */
export const CallRoom = ({
  credentials,
  withCamera,
  onLeave,
  onEnd,
  recording = false,
  hostCallId,
}: Props) => {
  const recorderRef = useRef<CallRecorder | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | undefined>(undefined);
  const micRef = useRef<IMicrophoneAudioTrack | undefined>(undefined);
  const camRef = useRef<ICameraVideoTrack | undefined>(undefined);
  const screenRef = useRef<ILocalVideoTrack | undefined>(undefined);
  const sdkRef = useRef<IAgoraRTC | undefined>(undefined);
  const remoteVideoRef = useRef<IRemoteVideoTrack | undefined>(undefined);

  const [status, setStatus] = useState<"connecting" | "live" | "error">(
    "connecting",
  );
  const [error, setError] = useState("");
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(withCamera);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        sdkRef.current = AgoraRTC;
        AgoraRTC.setLogLevel(3);
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "audio") {
            const remoteAudio = user.audioTrack as IRemoteAudioTrack;
            remoteAudio.play();
            recorderRef.current?.addTrack(remoteAudio.getMediaStreamTrack());
          } else {
            remoteVideoRef.current = user.videoTrack;
            setRemoteHasVideo(true);
            user.videoTrack?.play(remoteRef.current!);
          }
          setRemoteJoined(true);
        });
        client.on("user-unpublished", (_user, mediaType) => {
          if (mediaType === "video") setRemoteHasVideo(false);
        });
        client.on("user-left", () => {
          setRemoteJoined(false);
          setRemoteHasVideo(false);
        });

        await client.join(
          credentials.appId,
          credentials.channel,
          credentials.token,
          credentials.uid,
        );
        if (cancelled) return;

        const mic = await AgoraRTC.createMicrophoneAudioTrack();
        micRef.current = mic;
        const tracks: (IMicrophoneAudioTrack | ICameraVideoTrack)[] = [mic];
        if (withCamera) {
          try {
            const cam = await AgoraRTC.createCameraVideoTrack();
            camRef.current = cam;
            cam.play(localRef.current!);
            tracks.push(cam);
          } catch {
            setCamOn(false);
          }
        }
        await client.publish(tracks);
        if (hostCallId && recording) {
          try {
            const recorder = new CallRecorder();
            recorder.addTrack(mic.getMediaStreamTrack());
            recorder.start();
            recorderRef.current = recorder;
          } catch (e) {
            setError(`Recording is unavailable: ${(e as Error).message}`);
          }
        }
        if (!cancelled) setStatus("live");
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setStatus("error");
      }
    };
    start();

    return () => {
      cancelled = true;
      recorderRef.current?.stop().catch(() => undefined);
      micRef.current?.close();
      camRef.current?.close();
      screenRef.current?.close();
      clientRef.current?.removeAllListeners();
      clientRef.current?.leave();
    };
    // the room is created once for the given credentials
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remote video can arrive before its container is rendered
  useEffect(() => {
    if (remoteHasVideo && remoteRef.current) {
      remoteVideoRef.current?.play(remoteRef.current);
    }
  }, [remoteHasVideo]);

  const toggleMic = async () => {
    await micRef.current?.setEnabled(!micOn);
    setMicOn(!micOn);
  };

  const toggleCam = async () => {
    const client = clientRef.current;
    if (!client || sharing) return;
    if (!camRef.current) {
      try {
        const cam = await sdkRef.current!.createCameraVideoTrack();
        camRef.current = cam;
        cam.play(localRef.current!);
        await client.publish(cam);
        setCamOn(true);
      } catch (e) {
        setError(`Camera unavailable: ${(e as Error).message}`);
      }
      return;
    }
    await camRef.current.setEnabled(!camOn);
    setCamOn(!camOn);
  };

  const stopSharing = async () => {
    const client = clientRef.current;
    const screen = screenRef.current;
    if (!client || !screen) return;
    await client.unpublish(screen);
    screen.close();
    screenRef.current = undefined;
    setSharing(false);
    if (camRef.current) {
      camRef.current.play(localRef.current!);
      await client.publish(camRef.current);
    }
  };

  const startSharing = async () => {
    const client = clientRef.current;
    if (!client || sharing) return;
    try {
      const screen = await sdkRef.current!.createScreenVideoTrack(
        { encoderConfig: "1080p_1" },
        "disable",
      );
      const track = Array.isArray(screen) ? screen[0] : screen;
      if (camRef.current) await client.unpublish(camRef.current);
      screenRef.current = track;
      track.play(localRef.current!);
      track.on("track-ended", stopSharing);
      await client.publish(track);
      setSharing(true);
    } catch {
      // the user closed the browser's share picker: nothing to do
    }
  };

  // Stops the recording, saves it and starts the transcript and summary
  const finish = async () => {
    const recorder = recorderRef.current;
    recorderRef.current = undefined;
    if (!recorder || !hostCallId) return;
    setSaving(true);
    try {
      const result = await recorder.stop();
      if (result && result.blob.size > 2000) {
        await uploadAndProcessRecording(
          hostCallId,
          result.blob,
          result.extension,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    await finish();
    onLeave();
  };

  const endForEveryone = async () => {
    await finish();
    onEnd?.();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <div ref={remoteRef} className="h-full w-full" />
        {!remoteHasVideo && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/70">
            {status === "connecting"
              ? "Connecting…"
              : status === "error"
                ? error || "Could not connect"
                : remoteJoined
                  ? "Voice only: the other person's camera is off"
                  : "Waiting for the other person to join…"}
          </div>
        )}
        <div className="absolute bottom-3 right-3 h-28 w-44 overflow-hidden rounded-lg border border-white/30 bg-neutral-900">
          <div ref={localRef} className="h-full w-full" />
          {!camOn && !sharing && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
              Camera off
            </div>
          )}
        </div>
        {recording && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording
          </div>
        )}
        {saving && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
            Saving the recording…
          </div>
        )}
        {sharing && (
          <div className="absolute left-3 top-3 rounded bg-red-600 px-2 py-1 text-xs text-white">
            You are sharing your screen
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant={micOn ? "outline" : "destructive"}
          onClick={toggleMic}
          disabled={status !== "live"}
        >
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          {micOn ? "Mute" : "Unmute"}
        </Button>
        <Button
          variant={camOn ? "outline" : "destructive"}
          onClick={toggleCam}
          disabled={status !== "live" || sharing}
        >
          {camOn ? (
            <Video className="h-4 w-4" />
          ) : (
            <VideoOff className="h-4 w-4" />
          )}
          {camOn ? "Camera off" : "Camera on"}
        </Button>
        <Button
          variant={sharing ? "default" : "outline"}
          onClick={sharing ? stopSharing : startSharing}
          disabled={status !== "live"}
        >
          <MonitorUp className="h-4 w-4" />
          {sharing ? "Stop sharing" : "Share screen"}
        </Button>
        <Button variant="outline" onClick={leave} disabled={saving}>
          <PhoneOff className="h-4 w-4" />
          Leave
        </Button>
        {onEnd && (
          <Button
            variant="destructive"
            onClick={endForEveryone}
            disabled={saving}
          >
            End call for everyone
          </Button>
        )}
      </div>
    </div>
  );
};
