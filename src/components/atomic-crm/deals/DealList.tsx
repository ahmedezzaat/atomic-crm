import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { InputProps } from "ra-core";
import {
  useCanAccess,
  useGetIdentity,
  useListContext,
  useStore,
  useTranslate,
} from "ra-core";
import { matchPath, useLocation } from "react-router";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { CreateButton } from "@/components/admin/create-button";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { Button } from "@/components/ui/button";
import { ReferenceInput } from "@/components/admin/reference-input";
import { FilterButton } from "@/components/admin/filter-form";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";

import { DataImportButton } from "../dataImport/DataImportButton";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { TopToolbar } from "../layout/TopToolbar";
import { AccountManagerInput } from "../sales/AccountManagerInput";
import { DealArchivedList } from "./DealArchivedList";
import { DealCreate } from "./DealCreate";
import { DealEdit } from "./DealEdit";
import { DealEmpty } from "./DealEmpty";
import { DealListContent } from "./DealListContent";
import { DealShow } from "./DealShow";
import { DealTable } from "./DealTable";
import { OnlyMineInput } from "./OnlyMineInput";

const VIEW_STORE_KEY = "deals.list.view";
type View = "kanban" | "list";

const DealList = () => {
  const { identity } = useGetIdentity();
  const [view] = useStore<View>(VIEW_STORE_KEY, "kanban");
  const { dealCategories } = useConfigurationContext();
  const translate = useTranslate();
  const { canAccess: canAccessSalesList, isPending } = useCanAccess({
    resource: "sales",
    action: "list",
  });

  if (!identity) return null;

  const dealFilters = [
    <SearchInput source="q" alwaysOn />,
    <ReferenceInput source="company_id" reference="companies">
      <AutocompleteInput
        label={false}
        placeholder={translate("resources.deals.fields.company_id")}
      />
    </ReferenceInput>,
    <WrapperField source="category" label="resources.deals.fields.category">
      <SelectInput
        source="category"
        label={false}
        emptyText="resources.deals.fields.category"
        choices={dealCategories}
        optionText="label"
        optionValue="value"
      />
    </WrapperField>,
    ...(isPending
      ? []
      : [
          canAccessSalesList ? (
            <AccountManagerInput source="sales_id" alwaysOn />
          ) : (
            <OnlyMineInput source="sales_id" alwaysOn />
          ),
        ]),
  ];

  return (
    <List
      perPage={100}
      filter={{ "archived_at@is": null }}
      title={false}
      sort={{ field: "index", order: "DESC" }}
      filters={dealFilters}
      actions={<DealActions />}
      pagination={
        view === "list" ? (
          <ListPagination rowsPerPageOptions={[25, 50, 100, 200]} />
        ) : null
      }
    >
      <DealLayout />
    </List>
  );
};

const DealLayout = () => {
  const location = useLocation();
  const matchCreate = matchPath("/deals/create", location.pathname);
  const matchShow = matchPath("/deals/:id/show", location.pathname);
  const matchEdit = matchPath("/deals/:id", location.pathname);

  const { data, isPending, filterValues } = useListContext();
  const [view] = useStore<View>(VIEW_STORE_KEY, "kanban");
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters)
    return (
      <>
        <DealEmpty>
          <DealShow open={!!matchShow} id={matchShow?.params.id} />
          <DealArchivedList />
        </DealEmpty>
      </>
    );

  return (
    <div className="w-full">
      {view === "list" ? <DealTable /> : <DealListContent />}
      <DealArchivedList />
      <DealCreate open={!!matchCreate} />
      <DealEdit open={!!matchEdit && !matchCreate} id={matchEdit?.params.id} />
      <DealShow open={!!matchShow} id={matchShow?.params.id} />
    </div>
  );
};

const DealActions = () => {
  const [view, setView] = useStore<View>(VIEW_STORE_KEY, "kanban");
  return (
    <TopToolbar>
      <div className="flex">
        <Button
          size="sm"
          variant={view === "kanban" ? "default" : "outline"}
          className="rounded-r-none"
          aria-label="Kanban view"
          onClick={() => setView("kanban")}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={view === "list" ? "default" : "outline"}
          className="rounded-l-none"
          aria-label="List view"
          onClick={() => setView("list")}
        >
          <ListIcon className="h-4 w-4" />
        </Button>
      </div>
      <FilterButton />
      <DataImportButton resource="deals" />
      <ExportButton />
      <CreateButton label="resources.deals.action.new" />
    </TopToolbar>
  );
};

/**
 *
 * Used so that label of filters can be inferred for the select display,
 * but not be displayed when showing the input.
 */
const WrapperField = ({ children }: InputProps & { children: ReactNode }) =>
  children;

export default DealList;
