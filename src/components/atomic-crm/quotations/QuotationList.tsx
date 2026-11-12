import { FileText, Package, Plus, Trash2 } from "lucide-react";
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

import { formatMoney, quoteStatusLabel, type Quotation } from "./quoteUtils";

export const QuotationList = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const { data: quotes = [], refetch } = useGetList<Quotation>("quotations", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "created_at", order: "DESC" },
  });
  const { data: companies = [] } = useGetList<{ id: number; name: string }>(
    "companies",
    {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "name", order: "ASC" },
    },
  );
  const nameOf = (id: number) => companies.find((c) => c.id === id)?.name ?? "";
  const [deleteOne] = useDelete();

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quotations</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/quotations/products")}
          >
            <Package className="h-4 w-4" />
            Products
          </Button>
          <Button size="sm" onClick={() => navigate("/quotations/new")}>
            <Plus className="h-4 w-4" />
            New quotation
          </Button>
        </div>
      </div>
      <Card>
        <CardContent>
          {quotes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No quotations yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Pick a company, add products or custom lines, then print or save
                it as a PDF.
              </p>
              <Button size="sm" onClick={() => navigate("/quotations/new")}>
                <Plus className="h-4 w-4" />
                Create your first quotation
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/quotations/${q.id}`)}
                  >
                    <TableCell className="font-medium">{q.number}</TableCell>
                    <TableCell>{nameOf(q.company_id)}</TableCell>
                    <TableCell>{q.issue_date}</TableCell>
                    <TableCell>{q.valid_until ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {quoteStatusLabel[q.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(Number(q.total), q.currency)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete quotation"
                        onClick={() => {
                          if (!confirm(`Delete quotation ${q.number}?`)) return;
                          deleteOne(
                            "quotations",
                            { id: q.id },
                            {
                              onSuccess: () => {
                                notify("Quotation deleted");
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
