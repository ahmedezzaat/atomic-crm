import { ArrowLeft, Copy } from "lucide-react";
import { useGetOne, useNotify, useTranslate, useUpdate } from "ra-core";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type { Company } from "../types";
import {
  endCall,
  guestLink,
  joinCall,
  type CallCredentials,
  type CallRecord,
} from "./callApi";
import { CallResults } from "./CallResults";
import { CallRoom } from "./CallRoom";

/** Staff side of one call: copy the link, join and run the call. */
export const CallPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const translate = useTranslate();
  const { data: call, refetch } = useGetOne<CallRecord>(
    "calls",
    { id: Number(id) },
    {
      // follow the transcript and summary while they are being written
      refetchInterval: (query) =>
        ["uploading", "transcribing", "summarizing"].includes(
          query.state.data?.processing_status ?? "",
        )
          ? 3000
          : false,
    },
  );
  const [update] = useUpdate();
  const [record, setRecord] = useState<boolean>();
  const { data: company } = useGetOne<Company>(
    "companies",
    { id: call?.company_id as number },
    { enabled: !!call?.company_id },
  );
  const [credentials, setCredentials] = useState<CallCredentials>();
  const [withCamera, setWithCamera] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!call) return null;
  const link = guestLink(call);

  const join = async () => {
    setBusy(true);
    try {
      // the choice is stored on the call so the guest is told before joining
      const wantRecording = record ?? call.recording;
      if (wantRecording !== call.recording) {
        await update(
          "calls",
          {
            id: call.id,
            data: { recording: wantRecording },
            previousData: call,
          },
          { returnPromise: true },
        );
      }
      setCredentials(await joinCall(call.id));
      refetch();
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    await endCall(call.id);
    setCredentials(undefined);
    refetch();
    notify("Call ended");
  };

  return (
    <div className="mt-2 flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/calls")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">{call.title || "Call"}</h1>
        <Badge variant="outline" className="capitalize">
          {call.status}
        </Badge>
        {company && (
          <Link
            className="ml-2 text-sm text-muted-foreground underline"
            to={`/companies/${company.id}/show`}
          >
            {company.name}
          </Link>
        )}
      </div>

      {call.status !== "ended" && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Send this link to the person you are calling
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                dir="ltr"
                className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  notify("Link copied");
                }}
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              They open it in their browser, no login needed. The link stops
              working when the call is ended.
            </p>
          </CardContent>
        </Card>
      )}

      {call.status === "ended" ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            {translate("crm.calls.ended", { _: "This call has ended." })}
          </CardContent>
        </Card>
      ) : credentials ? (
        <CallRoom
          credentials={credentials}
          withCamera={withCamera}
          recording={credentials.recording}
          hostCallId={call.id}
          onLeave={() => {
            setCredentials(undefined);
            refetch();
          }}
          onEnd={end}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withCamera}
                onChange={(e) => setWithCamera(e.target.checked)}
              />
              Turn my camera on (uncheck for voice only)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={record ?? call.recording}
                onChange={(e) => setRecord(e.target.checked)}
              />
              Record this call, with a transcript and AI summary (the other
              person is told it is recorded)
            </label>
            <Button disabled={busy} onClick={join}>
              {busy ? "Joining…" : "Join call"}
            </Button>
          </CardContent>
        </Card>
      )}

      <CallResults call={call} onChanged={refetch} />
    </div>
  );
};

export default CallPage;
