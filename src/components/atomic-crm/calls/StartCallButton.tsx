import { Video } from "lucide-react";
import { useNotify } from "ra-core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

import type { Company } from "../types";
import { startCall } from "./callApi";

/** Creates a call for this company and opens it, ready to share the link. */
export const StartCallButton = ({ company }: { company: Company }) => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const { call } = await startCall({
        title: `Call with ${company.name}`,
        company_id: company.id,
      });
      navigate(`/calls/${call.id}`);
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={start}>
      <Video className="h-4 w-4" />
      {busy ? "Starting…" : "Start call"}
    </Button>
  );
};
