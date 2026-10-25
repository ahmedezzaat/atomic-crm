import { Plus } from "lucide-react";
import { useGetIdentity, useTranslate } from "ra-core";
import { useState } from "react";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { SearchInput } from "@/components/admin/search-input";
import { Button } from "@/components/ui/button";

import { TopToolbar } from "../layout/TopToolbar";
import { CompanyAvatar } from "../companies/CompanyAvatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { AddCustomerDialog } from "./AddCustomerDialog";
import { SubscriptionCreateDialog } from "./SubscriptionDialog";
import { formatMoney } from "./formatMoney";

const filters = [<SearchInput source="q" alwaysOn />];

export const CustomerList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={25}
      sort={{ field: "name", order: "ASC" }}
      filters={filters}
      actions={<CustomerListActions />}
      pagination={<ListPagination rowsPerPageOptions={[10, 25, 50, 100]} />}
    >
      <CustomerTable />
    </List>
  );
};

const CustomerListActions = () => {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  return (
    <TopToolbar>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setAddingCustomer(true)}
      >
        <Plus className="h-4 w-4" />
        {translate("resources.customers.add", { _: "Add customer" })}
      </Button>
      <AddCustomerDialog
        open={addingCustomer}
        close={() => setAddingCustomer(false)}
      />
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {translate("resources.subscriptions.create", {
          _: "Add subscription",
        })}
      </Button>
      <SubscriptionCreateDialog open={open} close={() => setOpen(false)} />
    </TopToolbar>
  );
};

const CustomerTable = () => {
  const { currency } = useConfigurationContext();
  return (
    <DataTable bulkActionButtons={false} rowClick="show">
      <DataTable.Col
        source="name"
        render={(c: any) => (
          <div className="flex items-center gap-2">
            <CompanyAvatar record={c} width={20} height={20} />
            <span className="font-medium">{c.name}</span>
          </div>
        )}
      />
      <DataTable.Col source="phone_number" />
      <DataTable.Col
        source="nb_active_subscriptions"
        label="Active subscriptions"
      />
      <DataTable.Col source="active_users" label="Users" />
      <DataTable.Col
        source="active_value"
        label="Active value"
        render={(c: any) => formatMoney(c.active_value, currency)}
      />
      <DataTable.Col source="next_end_date" label="Next renewal" />
    </DataTable>
  );
};

export default CustomerList;
