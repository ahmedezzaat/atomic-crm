import { Copy, Trash2, Video } from "lucide-react";
import { useDelete, useGetList, useGetMany, useNotify } from "ra-core";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Company } from "../types";
import { guestLink, type CallRecord } from "./callApi";

const duration = (call: CallRecord) => {
  if (!call.started_at || !call.ended_at) return "—";
  const seconds = Math.round(
    (new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) /
      1000,
  );
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export const CallList = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const [deleteOne] = useDelete();
  const { data: calls = [], refetch } = useGetList<CallRecord>(
    "calls",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "created_at", order: "DESC" },
    },
    { refetchInterval: 10000 },
  );
  const companyIds = [
    ...new Set(calls.map((c) => c.company_id).filter(Boolean)),
  ] as number[];
  const { data: companies = [] } = useGetMany<Company>(
    "companies",
    { ids: companyIds },
    { enabled: companyIds.length > 0 },
  );
  const companyName = (id: number | null) =>
    companies.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="mt-2 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Calls</h1>
      <Card>
        <CardContent>
          {calls.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Video className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No calls yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Open a company and click “Start call” to invite someone to a
                voice or video call with screen sharing.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/calls/${call.id}`)}
                  >
                    <TableCell className="font-medium">
                      {call.title || `Call ${call.id}`}
                    </TableCell>
                    <TableCell>{companyName(call.company_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {call.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {call.started_at
                        ? new Date(call.started_at).toLocaleString()
                        : "Not started"}
                    </TableCell>
                    <TableCell>{duration(call)}</TableCell>
                    <TableCell className="text-right">
                      {call.status !== "ended" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Copy link"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await navigator.clipboard.writeText(
                              guestLink(call),
                            );
                            notify("Link copied");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete call"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteOne(
                            "calls",
                            { id: call.id, previousData: call },
                            { onSuccess: () => refetch() },
                          );
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CallList;
