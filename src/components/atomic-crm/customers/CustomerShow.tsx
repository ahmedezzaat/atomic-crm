import { Plus } from "lucide-react";
import {
  ShowBase,
  useGetList,
  useShowContext,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataProvider, useNotify } from "ra-core";
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

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import {
  SubscriptionCreateDialog,
  SubscriptionEditDialog,
} from "./SubscriptionDialog";
import { formatMoney } from "./formatMoney";

export const CustomerShow = () => (
  <ShowBase>
    <CustomerShowContent />
  </ShowBase>
);

const CustomerShowContent = () => {
  const { record, isPending } = useShowContext();
  const translate = useTranslate();
  const { currency, subscriptionProducts } = useConfigurationContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Identifier | null>(null);

  const { data: subscriptions = [] } = useGetList(
    "subscriptions",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "end_date", order: "DESC" },
      filter: { company_id: record?.id },
    },
    { enabled: !!record },
  );

  if (isPending || !record) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-2 flex flex-col gap-4 pb-2">
      <Card>
        <CardContent>
          <div className="flex items-center mb-4">
            <CompanyAvatar record={record as any} />
            <div className="ml-3 flex-1">
              <h5 className="text-xl font-semibold">{record.name}</h5>
              <Link
                to={`/companies/${record.id}/show`}
                className="text-sm text-muted-foreground underline"
              >
                {translate("resources.customers.open_company", {
                  _: "Open company profile",
                })}
              </Link>
            </div>
            {record.is_customer && (
              <Button
                size="sm"
                variant="outline"
                className="mr-2"
                disabled={Number(record.nb_won_deals) > 0}
                title={
                  Number(record.nb_won_deals) > 0
                    ? "This company has a won deal, so it stays a customer"
                    : undefined
                }
                onClick={async () => {
                  await dataProvider.update("companies", {
                    id: record.id,
                    data: { is_customer: false },
                    previousData: { id: record.id },
                  });
                  notify("resources.customers.removed", {
                    messageArgs: { _: "Removed from customers" },
                  });
                  navigate("/customers");
                }}
              >
                {translate("resources.customers.remove", {
                  _: "Remove from customers",
                })}
              </Button>
            )}
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {translate("resources.subscriptions.create", {
                _: "Add subscription",
              })}
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Start date</TableHead>
                <TableHead>End date</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {translate("resources.subscriptions.empty", {
                      _: "No subscriptions yet.",
                    })}
                  </TableCell>
                </TableRow>
              )}
              {subscriptions.map((s: any) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => setEditingId(s.id)}
                >
                  <TableCell>
                    {subscriptionProducts.find((p) => p.value === s.product)
                      ?.label ?? s.product}
                  </TableCell>
                  <TableCell>{s.start_date}</TableCell>
                  <TableCell>{s.end_date}</TableCell>
                  <TableCell>{s.nb_users}</TableCell>
                  <TableCell>{formatMoney(s.value, currency)}</TableCell>
                  <TableCell>
                    {s.end_date >= today
                      ? translate("resources.subscriptions.active", {
                          _: "Active",
                        })
                      : translate("resources.subscriptions.expired", {
                          _: "Expired",
                        })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SubscriptionCreateDialog
        open={creating}
        close={() => setCreating(false)}
        companyId={record.id}
      />
      {editingId != null && (
        <SubscriptionEditDialog
          id={editingId}
          open
          close={() => setEditingId(null)}
        />
      )}
    </div>
  );
};

export default CustomerShow;
