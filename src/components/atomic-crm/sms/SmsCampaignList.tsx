import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useDelete, useGetList, useNotify } from "ra-core";
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

import { statusLabel, type SmsCampaign } from "./smsUtils";

export const SmsCampaignList = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const { data: campaigns = [], refetch } = useGetList<SmsCampaign>(
    "sms_campaigns",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "created_at", order: "DESC" },
    },
    { refetchInterval: 5000 },
  );
  const [deleteOne] = useDelete();

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">SMS campaigns</h1>
        <Button size="sm" onClick={() => navigate("/sms/new")}>
          <Plus className="h-4 w-4" />
          New campaign
        </Button>
      </div>

      <Card>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MessageSquareText className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No campaigns yet</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Write a message, choose which companies receive it and send it
                now or schedule it for later.
              </p>
              <Button size="sm" onClick={() => navigate("/sms/new")}>
                <Plus className="h-4 w-4" />
                Create your first campaign
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const filters = Object.values(c.audience ?? {}).filter(
                    Boolean,
                  );
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sms/${c.id}`)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{statusLabel[c.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {filters.length ? filters.join(" · ") : "All companies"}
                      </TableCell>
                      <TableCell>{c.recipients || "—"}</TableCell>
                      <TableCell>{c.nb_sent ?? 0}</TableCell>
                      <TableCell>{c.nb_delivered ?? 0}</TableCell>
                      <TableCell>{c.nb_failed ?? 0}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.schedule_at
                          ? new Date(c.schedule_at).toLocaleString()
                          : c.status === "sent"
                            ? "Sent"
                            : "On send"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete campaign"
                          disabled={c.status === "sending"}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteOne(
                              "sms_campaigns",
                              { id: c.id, previousData: c },
                              {
                                onSuccess: () => {
                                  notify("Campaign deleted");
                                  refetch();
                                },
                              },
                            );
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SmsCampaignList;
