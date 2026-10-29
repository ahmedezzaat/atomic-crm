import { useGetList } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";

import type { CallRecord } from "../calls/callApi";

/** Calls with this company and what was said, written up by the AI summary. */
export const CompanyCallsTab = ({
  companyId,
}: {
  companyId: number | string;
}) => {
  const { data: calls = [] } = useGetList<CallRecord>("calls", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "created_at", order: "DESC" },
    filter: { company_id: companyId },
  });

  if (calls.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No calls yet. Click “Start call” to begin one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      {calls.map((call) => (
        <Link
          key={call.id}
          to={`/calls/${call.id}`}
          className="rounded-md border p-3 text-sm transition-colors hover:bg-muted"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {call.title || `Call ${call.id}`}
            </span>
            <Badge variant="outline" className="capitalize">
              {call.status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(call.started_at ?? call.created_at).toLocaleString()}
          </div>
          {call.summary && (
            <p dir="auto" className="mt-2 line-clamp-3 text-muted-foreground">
              {call.summary}
            </p>
          )}
          {["uploading", "transcribing", "summarizing"].includes(
            call.processing_status,
          ) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Writing the summary…
            </p>
          )}
        </Link>
      ))}
    </div>
  );
};
