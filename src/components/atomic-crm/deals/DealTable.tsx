import { Trash2 } from "lucide-react";
import { useDeleteWithUndoController, useTranslate } from "ra-core";
import { DataTable } from "@/components/admin/data-table";
import { ReferenceField } from "@/components/admin/reference-field";
import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { useGetSalesName } from "../sales/useGetSalesName";
import type { Deal } from "../types";
import { findDealLabel } from "./dealUtils";

const RowDeleteButton = ({ deal }: { deal: Deal }) => {
  const { handleDelete, isPending } = useDeleteWithUndoController({
    record: deal,
    resource: "deals",
    redirect: false,
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Delete deal"
      disabled={isPending}
      onClick={(e) => {
        // the row opens the deal when clicked; this button must not
        e.stopPropagation();
        handleDelete(e);
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
};

const AccountManager = ({ deal }: { deal: Deal }) => (
  <>{useGetSalesName(deal.sales_id)}</>
);

const shortDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "-";

/** All deals as a table: sortable, with row selection and delete / bulk delete. */
export const DealTable = () => {
  const translate = useTranslate();
  const { dealStages, currency } = useConfigurationContext();
  const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  return (
    <DataTable rowClick="show">
      <DataTable.Col
        source="name"
        label={translate("resources.deals.fields.name", { _: "Deal" })}
        render={(d: Deal) => <span className="font-medium">{d.name}</span>}
      />
      <DataTable.Col
        source="company_id"
        label={translate("resources.deals.fields.company_id", {
          _: "Company",
        })}
        disableSort
        render={() => (
          <ReferenceField
            source="company_id"
            reference="companies"
            link={false}
          />
        )}
      />
      <DataTable.Col
        source="stage"
        label={translate("resources.deals.fields.stage", { _: "Stage" })}
        render={(d: Deal) => findDealLabel(dealStages, d.stage)}
      />
      <DataTable.Col
        source="amount"
        label={translate("resources.deals.fields.amount", { _: "Budget" })}
        render={(d: Deal) => money.format(d.amount ?? 0)}
      />
      <DataTable.Col
        source="expected_closing_date"
        label={translate("resources.deals.fields.expected_closing_date", {
          _: "Expected closing date",
        })}
        render={(d: Deal) => shortDate(d.expected_closing_date)}
      />
      <DataTable.Col
        source="sales_id"
        label="Account manager"
        disableSort
        render={(d: Deal) => <AccountManager deal={d} />}
      />
      <DataTable.Col
        source="created_at"
        label="Created"
        render={(d: Deal) => shortDate(d.created_at)}
      />
      <DataTable.Col
        label=""
        disableSort
        render={(d: Deal) => <RowDeleteButton deal={d} />}
      />
    </DataTable>
  );
};
