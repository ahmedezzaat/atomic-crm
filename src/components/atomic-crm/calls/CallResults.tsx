import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { processCall, recordingUrl, type CallRecord } from "./callApi";

const STEPS: Record<string, string> = {
  uploading: "Saving the recording…",
  transcribing: "Turning the recording into text…",
  summarizing: "Writing the summary…",
};

/** Recording, transcript and AI summary of one call. */
export const CallResults = ({
  call,
  onChanged,
}: {
  call: CallRecord;
  onChanged: () => void;
}) => {
  const [audioUrl, setAudioUrl] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (call.recording_path) {
      recordingUrl(call.recording_path).then(setAudioUrl);
    }
  }, [call.recording_path]);

  if (!call.recording_path && call.processing_status === "none") return null;

  const retry = async () => {
    setRetrying(true);
    setError("");
    try {
      await processCall(call.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  const busy = STEPS[call.processing_status];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Recording & summary</h2>

        {audioUrl && <audio controls src={audioUrl} className="w-full" />}

        {busy && <p className="text-sm text-muted-foreground">{busy}</p>}

        {call.processing_status === "failed" && (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p className="text-destructive">
              {call.processing_error ?? "Processing failed"}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={retrying || !call.recording_path}
              onClick={retry}
            >
              {retrying ? "Starting…" : "Try again"}
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {call.processing_status === "done" && (
          <>
            {call.summary && (
              <div dir="auto">
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                  Summary
                </h3>
                <p className="whitespace-pre-wrap text-sm">{call.summary}</p>
              </div>
            )}
            {call.key_points?.length > 0 && (
              <div dir="auto">
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                  Key points
                </h3>
                <ul className="list-disc space-y-1 ps-5 text-sm">
                  {call.key_points.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {call.action_items?.length > 0 && (
              <div dir="auto">
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                  Action items
                </h3>
                <ul className="list-disc space-y-1 ps-5 text-sm">
                  {call.action_items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {call.transcript && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Full transcript
                </summary>
                <p
                  dir="auto"
                  className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3"
                >
                  {call.transcript}
                </p>
              </details>
            )}
            <div>
              <Button
                size="sm"
                variant="ghost"
                disabled={retrying}
                onClick={retry}
              >
                Redo transcript and summary
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
