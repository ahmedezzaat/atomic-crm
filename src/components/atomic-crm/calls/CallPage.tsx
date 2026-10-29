import { ArrowLeft, Copy } from "lucide-react";
import { useGetOne, useNotify, useTranslate } from "ra-core";
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
import { CallRoom } from "./CallRoom";

/** Staff side of one call: copy the link, join and run the call. */
export const CallPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const translate = useTranslate();
  const { data: call, refetch } = useGetOne<CallRecord>("calls", {
    id: Number(id),
  });
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
          onLeave={() => setCredentials(undefined)}
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
            <Button disabled={busy} onClick={join}>
              {busy ? "Joining…" : "Join call"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CallPage;
