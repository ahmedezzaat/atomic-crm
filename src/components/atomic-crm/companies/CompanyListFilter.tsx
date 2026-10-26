import { Building, Megaphone, Tag, Truck, Users } from "lucide-react";
import {
  FilterLiveForm,
  useGetIdentity,
  useGetList,
  useTranslate,
} from "ra-core";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/admin/search-input";

import { FilterCategory } from "../filters/FilterCategory";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { AccountManagerFilter } from "../sales/AccountManagerInput";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";

export const CompanyListFilter = () => {
  const { identity } = useGetIdentity();
  const { companySectors, companyLeadSources } = useConfigurationContext();
  const translate = useTranslate();
  const { data: companyTags } = useGetList("company_tags", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "name", order: "ASC" },
  });
  const translatedSizes = sizes.map((size) => ({
    ...size,
    name: getTranslatedCompanySizeLabel(size, translate),
  }));
  return (
    <div className="w-52 min-w-52 flex flex-col gap-8">
      <FilterLiveForm>
        <SearchInput source="q" />
      </FilterLiveForm>

      <FilterCategory
        icon={<Building className="h-4 w-4" />}
        label="resources.companies.fields.size"
      >
        {translatedSizes.map((size) => (
          <ToggleFilterButton
            className="w-full justify-between"
            label={size.name}
            key={size.name}
            value={{ size: size.id }}
          />
        ))}
      </FilterCategory>

      <FilterCategory
        icon={<Truck className="h-4 w-4" />}
        label="resources.companies.fields.sector"
      >
        {companySectors.map((sector) => (
          <ToggleFilterButton
            className="w-full justify-between"
            label={sector.label}
            key={sector.value}
            value={{ sector: sector.value }}
          />
        ))}
      </FilterCategory>

      <FilterCategory
        icon={<Megaphone className="h-4 w-4" />}
        label="resources.companies.fields.lead_source"
      >
        {companyLeadSources.map((source) => (
          <ToggleFilterButton
            className="w-full justify-between"
            label={source.label}
            key={source.value}
            value={{ lead_source: source.value }}
          />
        ))}
      </FilterCategory>

      {companyTags && companyTags.length > 0 && (
        <FilterCategory
          icon={<Tag className="h-4 w-4" />}
          label="resources.company_tags.name"
        >
          {companyTags.map((tag) => (
            <ToggleFilterButton
              className="w-full justify-between"
              key={tag.id}
              label={
                <Badge
                  variant="secondary"
                  className="text-black text-xs font-normal cursor-pointer"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </Badge>
              }
              value={{ "tags@cs": `{${tag.id}}` }}
            />
          ))}
        </FilterCategory>
      )}

      <FilterCategory
        icon={<Users className="h-4 w-4" />}
        label="resources.companies.fields.sales_id"
      >
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("crm.common.me")}
          value={{ sales_id: identity?.id }}
        />
        <AccountManagerFilter className="w-full justify-between" />
      </FilterCategory>
    </div>
  );
};
