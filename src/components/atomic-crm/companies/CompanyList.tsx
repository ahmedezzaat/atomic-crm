import { LayoutGrid, List as ListIcon } from "lucide-react";
import {
  useGetIdentity,
  useListContext,
  useStore,
  useTranslate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { CreateButton } from "@/components/admin/create-button";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ListPagination } from "@/components/admin/list-pagination";
import { SortButton } from "@/components/admin/sort-button";

import { DataImportButton } from "../dataImport/DataImportButton";
import { TopToolbar } from "../layout/TopToolbar";
import { CompanyEmpty } from "./CompanyEmpty";
import { CompanyListFilter } from "./CompanyListFilter";
import { ImageList } from "./GridList";
import { CompanyTable } from "./CompanyTable";

const VIEW_STORE_KEY = "companies.list.view";
type View = "cards" | "list";

export const CompanyList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;
  return (
    <List
      title={false}
      perPage={25}
      sort={{ field: "name", order: "ASC" }}
      actions={<CompanyListActions />}
      pagination={<ListPagination rowsPerPageOptions={[10, 25, 50, 100]} />}
    >
      <CompanyListLayout />
    </List>
  );
};

const CompanyListLayout = () => {
  const { data, isPending, filterValues } = useListContext();
  const [view] = useStore<View>(VIEW_STORE_KEY, "cards");
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters) return <CompanyEmpty />;

  return (
    <div className="w-full flex flex-row gap-8">
      <CompanyListFilter />
      <div className="flex flex-col flex-1 gap-4">
        {view === "list" ? <CompanyTable /> : <ImageList />}
      </div>
    </div>
  );
};

const CompanyListActions = () => {
  const translate = useTranslate();
  const [view, setView] = useStore<View>(VIEW_STORE_KEY, "cards");
  return (
    <TopToolbar>
      <div className="flex">
        <Button
          size="sm"
          variant={view === "cards" ? "default" : "outline"}
          className="rounded-r-none"
          aria-label="Cards view"
          onClick={() => setView("cards")}
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
      <SortButton fields={["name", "created_at", "nb_contacts"]} />
      <DataImportButton resource="companies" />
      <ExportButton />
      <CreateButton
        label={translate("resources.companies.action.new", {
          _: "New Company",
        })}
      />
    </TopToolbar>
  );
};
