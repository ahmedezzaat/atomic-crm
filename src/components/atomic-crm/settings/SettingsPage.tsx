/* eslint-disable react-refresh/only-export-components */
import { CallSettingsCard } from "./CallSettingsCard";
import { LeadSettingsCard } from "./LeadSettingsCard";
import { SmsSettingsCard } from "./SmsSettingsCard";
import {
  Building2,
  CheckSquare,
  Handshake,
  MessageCircle,
  MessageSquareText,
  Palette,
  Phone,
  RotateCcw,
  Save,
  Search,
  StickyNote,
  Tag,
  Tags,
  UserCheck,
} from "lucide-react";
import type { RaRecord } from "ra-core";
import {
  EditBase,
  Form,
  useGetList,
  useInput,
  useNotify,
  useTranslate,
} from "ra-core";
import {
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toSlug } from "@/lib/toSlug";
import { ArrayInput } from "@/components/admin/array-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";

import ImageEditorField from "../misc/ImageEditorField";
import {
  useConfigurationContext,
  useConfigurationUpdater,
  type ConfigurationContextValue,
} from "../root/ConfigurationContext";
import { defaultConfiguration } from "../root/defaultConfiguration";
import { SettingsCompanyTags } from "./SettingsCompanyTags";
import { SettingsTags } from "./SettingsTags";

type SectionItem = {
  id: string;
  label: string;
  fallback: string;
  icon: ComponentType<{ className?: string }>;
  /** extra words the settings search also matches */
  keywords: string;
  /** integrations have their own Save button and are not part of the main form */
  standalone?: boolean;
  plural?: boolean;
};

const GROUPS: { title: string; items: SectionItem[] }[] = [
  {
    title: "General",
    items: [
      {
        id: "branding",
        label: "crm.settings.sections.branding",
        fallback: "Branding",
        icon: Palette,
        keywords: "logo title name app",
      },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        id: "companies",
        label: "resources.companies.name",
        fallback: "Companies",
        icon: Building2,
        keywords: "sectors cities countries competitors lead sources",
        plural: true,
      },
      {
        id: "customers",
        label: "resources.customers.name",
        fallback: "Customers",
        icon: UserCheck,
        keywords: "products subscriptions",
        plural: true,
      },
      {
        id: "deals",
        label: "resources.deals.name",
        fallback: "Deals",
        icon: Handshake,
        keywords: "stages pipeline currency categories",
        plural: true,
      },
      {
        id: "tasks",
        label: "resources.tasks.name",
        fallback: "Tasks",
        icon: CheckSquare,
        keywords: "types follow-up",
        plural: true,
      },
      {
        id: "notes",
        label: "resources.notes.name",
        fallback: "Notes",
        icon: StickyNote,
        keywords: "statuses cold warm hot",
        plural: true,
      },
    ],
  },
  {
    title: "Tags",
    items: [
      {
        id: "tags",
        label: "resources.tags.name",
        fallback: "Tags",
        icon: Tag,
        keywords: "contacts labels colors",
        plural: true,
      },
      {
        id: "company-tags",
        label: "resources.company_tags.name",
        fallback: "Company tags",
        icon: Tags,
        keywords: "companies labels colors",
        plural: true,
      },
    ],
  },
  {
    title: "Messaging & integrations",
    items: [
      {
        id: "leads",
        label: "",
        fallback: "WhatsApp & leads",
        icon: MessageCircle,
        keywords:
          "meta cloud api coexistence webhook token template lead capture form",
        standalone: true,
      },
      {
        id: "sms",
        label: "",
        fallback: "SMS",
        icon: MessageSquareText,
        keywords: "cequens sender names token",
        standalone: true,
      },
      {
        id: "calls",
        label: "",
        fallback: "Calls & AI",
        icon: Phone,
        keywords:
          "agora voice video openai whisper anthropic claude transcript recording token key certificate",
        standalone: true,
      },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

/** Only the active section is shown; the others stay mounted so Save keeps every value. */
const Section = ({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) => <div className={active === id ? "space-y-6" : "hidden"}>{children}</div>;

/** Ensure every item in a { value, label } array has a value (slug from label). */
const ensureValues = (items: { value?: string; label: string }[] | undefined) =>
  items?.map((item) => ({ ...item, value: item.value || toSlug(item.label) }));

type ValidateItemsInUseMessages = {
  duplicate?: (displayName: string, duplicates: string[]) => string;
  inUse?: (displayName: string, inUse: string[]) => string;
  validating?: string;
};

/**
 * Validate that no items were removed if they are still referenced by existing deals.
 * Also rejects duplicate slug values.
 * Returns undefined if valid, or an error message string.
 */
export const validateItemsInUse = (
  items: { value: string; label: string }[] | undefined,
  deals: RaRecord[] | undefined,
  fieldName: string,
  displayName: string,
  messages?: ValidateItemsInUseMessages,
) => {
  if (!items) return undefined;
  // Check for duplicate slugs
  const slugs = items.map((i) => i.value || toSlug(i.label));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
  }
  if (duplicates.size > 0) {
    const duplicatesList = [...duplicates];
    return (
      messages?.duplicate?.(displayName, duplicatesList) ??
      `Duplicate ${displayName}: ${duplicatesList.join(", ")}`
    );
  }
  // Check that no in-use value was removed (skip if deals haven't loaded)
  if (!deals) return messages?.validating ?? "Validating…";
  const values = new Set(slugs);
  const inUse = [
    ...new Set(
      deals
        .filter(
          (deal) => deal[fieldName] && !values.has(deal[fieldName] as string),
        )
        .map((deal) => deal[fieldName] as string),
    ),
  ];
  if (inUse.length > 0) {
    return (
      messages?.inUse?.(displayName, inUse) ??
      `Cannot remove ${displayName} that are still used by deals: ${inUse.join(", ")}`
    );
  }
  return undefined;
};

const getCurrencyChoices = () => {
  const displayNames = new Intl.DisplayNames(
    typeof navigator !== "undefined"
      ? (navigator.languages as string[])
      : ["en"],
    { type: "currency" },
  );
  return Intl.supportedValuesOf("currency").map((code) => ({
    id: code,
    name: `${code} – ${displayNames.of(code)}`,
  }));
};

const transformFormValues = (data: Record<string, any>) => ({
  config: {
    title: data.title,
    lightModeLogo: data.lightModeLogo,
    darkModeLogo: data.darkModeLogo,
    currency: data.currency,
    companyCities: ensureValues(data.companyCities),
    companyCompetitors: ensureValues(data.companyCompetitors),
    companyCountries: ensureValues(data.companyCountries),
    companyLeadSources: ensureValues(data.companyLeadSources),
    companySectors: ensureValues(data.companySectors),
    dealCategories: ensureValues(data.dealCategories),
    smsSenders: ensureValues(data.smsSenders),
    subscriptionProducts: ensureValues(data.subscriptionProducts),
    taskTypes: ensureValues(data.taskTypes),
    dealStages: ensureValues(data.dealStages),
    dealPipelineStatuses: data.dealPipelineStatuses,
    noteStatuses: ensureValues(data.noteStatuses),
  } as ConfigurationContextValue,
});

export const SettingsPage = () => {
  const updateConfiguration = useConfigurationUpdater();
  const notify = useNotify();

  return (
    <EditBase
      resource="configuration"
      id={1}
      mutationMode="pessimistic"
      redirect={false}
      transform={transformFormValues}
      mutationOptions={{
        onSuccess: (data: any) => {
          updateConfiguration(data.config);
          notify("crm.settings.saved");
        },
        onError: () => {
          notify("crm.settings.save_error", {
            type: "error",
          });
        },
      }}
    >
      <SettingsForm />
    </EditBase>
  );
};

SettingsPage.path = "/settings";

const SettingsForm = () => {
  const config = useConfigurationContext();

  const defaultValues = useMemo(
    () => ({
      title: config.title,
      lightModeLogo: { src: config.lightModeLogo },
      darkModeLogo: { src: config.darkModeLogo },
      currency: config.currency,
      companyCities: config.companyCities,
      companyCompetitors: config.companyCompetitors,
      companyCountries: config.companyCountries,
      companyLeadSources: config.companyLeadSources,
      companySectors: config.companySectors,
      dealCategories: config.dealCategories,
      smsSenders: config.smsSenders,
      subscriptionProducts: config.subscriptionProducts,
      taskTypes: config.taskTypes,
      dealStages: config.dealStages,
      dealPipelineStatuses: config.dealPipelineStatuses,
      noteStatuses: config.noteStatuses,
    }),
    [config],
  );

  return (
    <Form defaultValues={defaultValues}>
      <SettingsFormFields />
    </Form>
  );
};

const SettingsFormFields = () => {
  const translate = useTranslate();
  const currencyChoices = useMemo(() => getCurrencyChoices(), []);
  const {
    watch,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useFormContext();

  const [params, setParams] = useSearchParams();
  const requested = params.get("section") ?? "";
  const active = ALL_ITEMS.some((i) => i.id === requested)
    ? requested
    : "branding";
  const activeItem = ALL_ITEMS.find((i) => i.id === active)!;
  const [query, setQuery] = useState("");
  const open = (id: string) => {
    setParams({ section: id }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  const itemLabel = (item: SectionItem) =>
    item.label
      ? translate(item.label, {
          smart_count: item.plural ? 2 : 1,
          _: item.fallback,
        })
      : item.fallback;
  const needle = query.trim().toLowerCase();
  const matches = (item: SectionItem) =>
    !needle ||
    `${itemLabel(item)} ${item.keywords}`.toLowerCase().includes(needle);

  const dealStages = watch("dealStages");
  const dealPipelineStatuses: string[] = watch("dealPipelineStatuses") ?? [];
  const stageDisplayName = translate("crm.settings.validation.entities.stages");
  const categoryDisplayName = translate(
    "crm.settings.validation.entities.categories",
  );

  const { data: deals } = useGetList("deals", {
    pagination: { page: 1, perPage: 1000 },
  });

  const validateDealStages = useCallback(
    (stages: { value: string; label: string }[] | undefined) =>
      validateItemsInUse(stages, deals, "stage", stageDisplayName, {
        duplicate: (displayName, duplicates) =>
          translate("crm.settings.validation.duplicate", {
            display_name: displayName,
            items: duplicates.join(", "),
          }),
        inUse: (displayName, inUse) =>
          translate("crm.settings.validation.in_use", {
            display_name: displayName,
            items: inUse.join(", "),
          }),
        validating: translate("crm.settings.validation.validating"),
      }),
    [deals, stageDisplayName, translate],
  );

  const validateDealCategories = useCallback(
    (categories: { value: string; label: string }[] | undefined) =>
      validateItemsInUse(categories, deals, "category", categoryDisplayName, {
        duplicate: (displayName, duplicates) =>
          translate("crm.settings.validation.duplicate", {
            display_name: displayName,
            items: duplicates.join(", "),
          }),
        inUse: (displayName, inUse) =>
          translate("crm.settings.validation.in_use", {
            display_name: displayName,
            items: inUse.join(", "),
          }),
        validating: translate("crm.settings.validation.validating"),
      }),
    [categoryDisplayName, deals, translate],
  );

  return (
    <div className="flex gap-8 mt-4 pb-20">
      {/* Left navigation */}
      <nav className="hidden md:block w-56 shrink-0">
        <div className="sticky top-4 space-y-4">
          <h1 className="text-2xl font-semibold px-3">
            {translate("crm.settings.title")}
          </h1>
          <div className="relative px-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a setting…"
              aria-label="Find a setting"
              className="pl-9"
            />
          </div>
          {GROUPS.map((group) => {
            const items = group.items.filter(matches);
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="space-y-1">
                <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => open(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {itemLabel(item)}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {needle && !ALL_ITEMS.some(matches) && (
            <p className="px-3 text-sm text-muted-foreground">
              No setting matches "{query}".
            </p>
          )}
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-2xl space-y-6">
        <Section id="branding" active={active}>
          {/* Branding */}
          <Card id="branding">
            <CardContent className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                {translate("crm.settings.sections.branding")}
              </h2>
              <TextInput source="title" label="crm.settings.app_title" />
              <div className="flex gap-8">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm text-muted-foreground">
                    {translate("crm.settings.light_mode_logo")}
                  </p>
                  <ImageEditorField
                    source="lightModeLogo"
                    width={100}
                    height={100}
                    linkPosition="bottom"
                    backgroundImageColor="#f5f5f5"
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm text-muted-foreground">
                    {translate("crm.settings.dark_mode_logo")}
                  </p>
                  <ImageEditorField
                    source="darkModeLogo"
                    width={100}
                    height={100}
                    linkPosition="bottom"
                    backgroundImageColor="#1a1a1a"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section id="companies" active={active}>
          {/* Companies */}
          <Card id="companies">
            <CardContent className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                {translate("resources.companies.name", {
                  smart_count: 2,
                })}
              </h2>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.companies.sectors")}
              </h3>
              <ArrayInput
                source="companySectors"
                label={false}
                helperText={false}
              >
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.companies.cities")}
              </h3>
              <ArrayInput
                source="companyCities"
                label={false}
                helperText={false}
              >
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.companies.competitors")}
              </h3>
              <ArrayInput
                source="companyCompetitors"
                label={false}
                helperText={false}
              >
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.companies.countries")}
              </h3>
              <ArrayInput
                source="companyCountries"
                label={false}
                helperText={false}
              >
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.companies.lead_sources")}
              </h3>
              <ArrayInput
                source="companyLeadSources"
                label={false}
                helperText={false}
              >
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>
        </Section>

        <Section id="customers" active={active}>
          {/* Customers */}
          <Card id="customers">
            <CardContent className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                {translate("resources.customers.name", {
                  smart_count: 2,
                  _: "Customers",
                })}
              </h2>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("resources.customers.products", { _: "Products" })}
              </h3>
              <ArrayInput
                source="subscriptionProducts"
                label={false}
                helperText={false}
              >
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>
        </Section>

        <Section id="sms" active={active}>
          <SmsSettingsCard />
        </Section>

        <Section id="calls" active={active}>
          <CallSettingsCard />
        </Section>

        <Section id="leads" active={active}>
          <LeadSettingsCard />
        </Section>

        <Section id="deals" active={active}>
          {/* Deals */}
          <Card id="deals">
            <CardContent className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                {translate("resources.deals.name", {
                  smart_count: 2,
                })}
              </h2>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.deals.currency")}
              </h3>
              <AutocompleteInput
                source="currency"
                label={false}
                choices={currencyChoices}
                inputText={(choice) => choice?.id}
                modal
              />

              <Separator />

              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.deals.stages")}
              </h3>
              <ArrayInput
                source="dealStages"
                label={false}
                helperText={false}
                validate={validateDealStages}
              >
                <SimpleFormIterator disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>

              <Separator />

              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.deals.pipeline_statuses")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {translate("crm.settings.deals.pipeline_help")}
              </p>
              <div className="flex flex-wrap gap-2">
                {dealStages?.map(
                  (stage: { value: string; label: string }, idx: number) => {
                    const isSelected = dealPipelineStatuses.includes(
                      stage.value,
                    );
                    return (
                      <Button
                        key={idx}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (isSelected) {
                            setValue(
                              "dealPipelineStatuses",
                              dealPipelineStatuses.filter(
                                (s) => s !== stage.value,
                              ),
                            );
                          } else {
                            setValue("dealPipelineStatuses", [
                              ...dealPipelineStatuses,
                              stage.value,
                            ]);
                          }
                        }}
                      >
                        {stage.label || stage.value}
                      </Button>
                    );
                  },
                )}
              </div>

              <Separator />

              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.deals.categories")}
              </h3>
              <ArrayInput
                source="dealCategories"
                label={false}
                helperText={false}
                validate={validateDealCategories}
              >
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>
        </Section>

        <Section id="notes" active={active}>
          {/* Notes */}
          <Card id="notes">
            <CardContent className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                {translate("resources.notes.name", {
                  smart_count: 2,
                })}
              </h2>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.notes.statuses")}
              </h3>
              <ArrayInput
                source="noteStatuses"
                label={false}
                helperText={false}
              >
                <SimpleFormIterator inline disableReordering disableClear>
                  <TextInput source="label" label={false} className="flex-1" />
                  <ColorInput source="color" />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>
        </Section>

        <Section id="tasks" active={active}>
          {/* Tasks */}
          <Card id="tasks">
            <CardContent className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">
                {translate("resources.tasks.name", {
                  smart_count: 2,
                })}
              </h2>
              <h3 className="text-lg font-medium text-muted-foreground">
                {translate("crm.settings.tasks.types")}
              </h3>
              <ArrayInput source="taskTypes" label={false} helperText={false}>
                <SimpleFormIterator disableReordering disableClear>
                  <TextInput source="label" label={false} />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>
        </Section>

        {/* Tags */}
        <Section id="tags" active={active}>
          <SettingsTags />
        </Section>

        {/* Company tags */}
        <Section id="company-tags" active={active}>
          <SettingsCompanyTags />
        </Section>
      </div>

      {/* Sticky save button, only for sections saved by the main form */}
      {!activeItem.standalone && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4">
          <div className="max-w-screen-xl mx-auto flex gap-8 px-4">
            <div className="hidden md:block w-56 shrink-0" />
            <div className="flex-1 min-w-0 max-w-2xl flex justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  reset({
                    ...defaultConfiguration,
                    lightModeLogo: {
                      src: defaultConfiguration.lightModeLogo,
                    },
                    darkModeLogo: { src: defaultConfiguration.darkModeLogo },
                  })
                }
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                {translate("crm.settings.reset_defaults")}
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.history.back()}
                >
                  {translate("ra.action.cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <Save className="h-4 w-4 mr-1" />
                  {isSubmitting
                    ? translate("crm.settings.saving")
                    : translate("ra.action.save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** A minimal color picker input compatible with ra-core's useInput. */
const ColorInput = ({ source }: { source: string }) => {
  const { field } = useInput({ source });
  return (
    <input
      type="color"
      {...field}
      value={field.value || "#000000"}
      className="w-9 h-9 shrink-0 cursor-pointer appearance-none rounded border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:cursor-pointer [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:cursor-pointer [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-none"
    />
  );
};
