import { Mail } from "lucide-react";
import {
  useDataProvider,
  useListContext,
  useNotify,
  useRefresh,
} from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";

import type { Company } from "../types";
import { enrichCompanies } from "./enrich";

const CHUNK = 25;

/**
 * Looks for an email on the website of every company in the current list
 * (after filters) that has a website and no email yet, and saves it on the company.
 */
export const FindEmailsButton = () => {
  const dataProvider = useDataProvider();
  const { filterValues } = useListContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [progress, setProgress] = useState<string>();

  const run = async () => {
    setProgress("Preparing…");
    try {
      const { data } = await dataProvider.getList<Company>("companies", {
        pagination: { page: 1, perPage: 2000 },
        sort: { field: "name", order: "ASC" },
        filter: filterValues,
      });
      const ids = data.filter((c) => c.website && !c.email).map((c) => c.id);
      if (ids.length === 0) {
        notify(
          "Every company in this list already has an email or no website.",
        );
        return;
      }
      let found = 0;
      let checked = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        setProgress(`Looking… ${i}/${ids.length}`);
        const res = await enrichCompanies(
          ids.slice(i, i + CHUNK) as number[],
          true,
        );
        checked += res.enriched;
        found += res.results.filter(
          (r: { id: number; status: string; emails?: number }) =>
            r.status === "ok" && (r.emails ?? 0) > 0,
        ).length;
      }
      notify(
        `Found an email for ${found} of ${ids.length} companies (${checked} websites opened).`,
      );
      refresh();
    } catch (e) {
      notify(`Could not look for emails: ${(e as Error).message}`, {
        type: "error",
      });
    } finally {
      setProgress(undefined);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={progress !== undefined}
      onClick={run}
      title="Looks on each company's website for an email and saves it on the company"
    >
      <Mail className="h-4 w-4" />
      {progress ?? "Find emails"}
    </Button>
  );
};
