import { useTranslate } from "ra-core";
import { DataTable } from "@/components/admin/data-table";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { CompanyAvatar } from "./CompanyAvatar";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";

export const CompanyTable = () => {
  const translate = useTranslate();
  const { companySectors, companyCompetitors } = useConfigurationContext();
  const labelOf = (list: { value: string; label: string }[], value?: string) =>
    list.find((item) => item.value === value)?.label ?? value;

  return (
    <DataTable bulkActionButtons={false} rowClick="show">
      <DataTable.Col
        source="name"
        render={(c: Company) => (
          <div className="flex items-center gap-2">
            <CompanyAvatar record={c} width={20} height={20} />
            <span className="font-medium">{c.name}</span>
          </div>
        )}
      />
      <DataTable.Col source="phone_number" />
      <DataTable.Col source="city" />
      <DataTable.Col source="country" />
      <DataTable.Col
        source="sector"
        render={(c: Company) => labelOf(companySectors, c.sector)}
      />
      <DataTable.Col
        source="competitor"
        render={(c: Company) => labelOf(companyCompetitors, c.competitor)}
      />
      <DataTable.Col
        source="size"
        render={(c: Company) => {
          const size = sizes.find((s) => s.id === c.size);
          return size ? getTranslatedCompanySizeLabel(size, translate) : null;
        }}
      />
      <DataTable.Col source="nb_contacts" />
      <DataTable.Col source="nb_deals" />
    </DataTable>
  );
};
