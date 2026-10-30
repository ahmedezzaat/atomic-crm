import { MessageCircle, Plus, Trash2 } from "lucide-react";
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

import { waStatusLabel, type WaCampaign } from "./waUtils";

export const WaCampaignList = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const { data: campaigns = [], refetch } = useGetList<WaCampaign>(
    "wa_campaigns",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "created_at", order: "DESC" },
    },
    { refetchInterval: 10000 },
  );
  const [deleteOne] = useDelete();

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">WhatsApp campaigns</h1>
        <Button size="sm" onClick={() => navigate("/wa-campaigns/new")}>
          <Plus className="h-4 w-4" />
          New campaign
        </Button>
      </div>

      <Card>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MessageCircle className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No WhatsApp campaigns yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Pick a group of companies and an approved template. Messages go
                out in small daily batches, never to anyone who opted out.
              </p>
              <Button size="sm" onClick={() => navigate("/wa-campaigns/new")}>
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
                  <TableHead>Template</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Read</TableHead>
                  <TableHead>Replied</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/wa-campaigns/${c.id}`)}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{waStatusLabel[c.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground" dir="ltr">
                      {c.template_name || "-"}
                    </TableCell>
                    <TableCell>{c.nb_sent ?? 0}</TableCell>
                    <TableCell>{c.nb_delivered ?? 0}</TableCell>
                    <TableCell>{c.nb_read ?? 0}</TableCell>
                    <TableCell>{c.nb_replied ?? 0}</TableCell>
                    <TableCell>{c.nb_failed ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete campaign"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteOne(
                            "wa_campaigns",
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WaCampaignList;
