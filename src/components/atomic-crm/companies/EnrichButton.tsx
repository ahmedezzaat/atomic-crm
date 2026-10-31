import { Sparkles } from "lucide-react";
import { useNotify, useRefresh } from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";

import type { Company } from "../types";
import { enrichCompanies } from "./enrich";

/** Finds emails, extra phone numbers and social links on the company's website. */
export const EnrichButton = ({ company }: { company: Company }) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await enrichCompanies([company.id as number]);
      const status = res.results[0]?.status;
      if (status === "no_website") notify("This company has no website.");
      else if (status === "unreachable")
        notify("The website could not be opened.", { type: "warning" });
      else
        notify(
          res.emails || res.phones
            ? `Found ${res.emails} email(s) and ${res.phones} extra number(s). See the Contacts tab.`
            : "Nothing new found on the website.",
        );
      refresh();
    } catch (e) {
      notify(`Could not enrich: ${(e as Error).message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || !company.website}
      title={company.website ? undefined : "This company has no website"}
      onClick={run}
    >
      <Sparkles className="h-4 w-4" />
      {busy ? "Looking…" : "Find emails & numbers"}
    </Button>
  );
};
