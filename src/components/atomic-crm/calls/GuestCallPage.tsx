import { useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { joinAsGuest, type CallCredentials } from "./callApi";
import { CallRoom } from "./CallRoom";

/** Public page the customer opens from the link: no CRM login needed. */
export const GuestCallPage = () => {
  const { guestKey = "" } = useParams();
  const [credentials, setCredentials] = useState<CallCredentials>();
  const [withCamera, setWithCamera] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(false);

  const join = async () => {
    setBusy(true);
    setError("");
    try {
      setCredentials(await joinAsGuest(guestKey));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 p-4">
      {credentials && !left ? (
        <CallRoom
          credentials={credentials}
          withCamera={withCamera}
          onLeave={() => setLeft(true)}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <h1 className="text-2xl font-semibold">
              {left ? "You left the call" : "Join the call"}
            </h1>
            {!left && (
              <>
                <p className="text-sm text-muted-foreground">
                  Your browser will ask to use your microphone
                  {withCamera ? " and camera" : ""}.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={withCamera}
                    onChange={(e) => setWithCamera(e.target.checked)}
                  />
                  Turn my camera on (uncheck for voice only)
                </label>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              disabled={busy}
              onClick={() => {
                setLeft(false);
                join();
              }}
            >
              {busy ? "Joining…" : left ? "Rejoin" : "Join call"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GuestCallPage;
