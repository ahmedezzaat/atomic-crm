import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { SortButton } from "@/components/admin/sort-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, UserPlus } from "lucide-react";
import {
  RecordContextProvider,
  ShowBase,
  useListContext,
  useLocaleState,
  useRecordContext,
  useShowContext,
  useTranslate,
} from "ra-core";
import {
  Link,
  Link as RouterLink,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router";

import { useIsMobile } from "@/hooks/use-mobile";
import { AddTask } from "../tasks/AddTask";
import { TasksIterator } from "../tasks/TasksIterator";
import { ActivityLog } from "../activity/ActivityLog";
import { Avatar } from "../contacts/Avatar";
import { findDealLabel } from "../deals/dealUtils";
import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { MobileBackButton } from "../misc/MobileBackButton";
import { formatRelativeDate } from "../misc/RelativeDate";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Contact, Deal } from "../types";
import {
  AdditionalInfo,
  AddressInfo,
  CompanyAside,
  CompanyInfo,
  ContextInfo,
} from "./CompanyAside";
import { CompanyAvatar } from "./CompanyAvatar";

export const CompanyShow = () => {
  const isMobile = useIsMobile();

  return (
    <ShowBase>
      {isMobile ? <CompanyShowContentMobile /> : <CompanyShowContent />}
    </ShowBase>
  );
};

const CompanyShowContentMobile = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Company>();
  if (isPending || !record) return null;

  return (
    <>
      <MobileHeader>
        <MobileBackButton to="/" />
        <div className="flex flex-1">
          <Link to="/">
            <h1 className="text-xl font-semibold">
              {translate("resources.companies.forcedCaseName")}
            </h1>
          </Link>
        </div>
      </MobileHeader>

      <MobileContent>
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <CompanyAvatar />
            <div className="mx-3 flex-1">
              <h2 className="text-2xl font-bold">{record.name}</h2>
            </div>
          </div>
        </div>
        <CompanyInfo record={record} />
        <AddressInfo record={record} />
        <ContextInfo record={record} />
        <AdditionalInfo record={record} />
      </MobileContent>
    </>
  );
};

const CompanyShowContent = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Company>();
  const navigate = useNavigate();

  // Get tab from URL or default to "activity"
  const tabMatch = useMatch("/companies/:id/show/:tab");
  const currentTab = tabMatch?.params?.tab || "activity";

  const handleTabChange = (value: string) => {
    if (value === currentTab) return;
    if (value === "activity") {
      navigate(`/companies/${record?.id}/show`);
      return;
    }
    navigate(`/companies/${record?.id}/show/${value}`);
  };

  if (isPending || !record) return null;

  return (
    <div className="mt-2 flex pb-2 gap-8">
      <div className="flex-1">
        <Card>
          <CardContent>
            <div className="flex mb-3">
              <CompanyAvatar />
              <h5 className="text-xl font-semibold ml-2 flex-1">
                {record.name}
              </h5>
            </div>
            <Tabs defaultValue={currentTab} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="activity">
                  {translate("crm.common.activity")}
                </TabsTrigger>
                <TabsTrigger value="contacts">
                  {record.nb_contacts === 0
                    ? translate("resources.companies.no_contacts")
                    : translate("resources.companies.nb_contacts", {
                        smart_count: record.nb_contacts ?? 0,
                      })}
                </TabsTrigger>
                <TabsTrigger value="tasks">
                  {translate("resources.tasks.name", { smart_count: 2 })}
                </TabsTrigger>
                <TabsTrigger value="deals">
                  {translate("resources.companies.nb_deals", {
                    smart_count: record.nb_deals ?? 0,
                  })}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tasks" className="pt-2">
                <div className="flex flex-row justify-end mt-1">
                  <AddTask forCompany />
                </div>
                <ReferenceManyField
                  reference="tasks"
                  target="company_id"
                  sort={{ field: "due_date", order: "ASC" }}
                  perPage={1000}
                >
                  <TasksIterator />
                </ReferenceManyField>
              </TabsContent>
              <TabsContent value="activity" className="pt-2">
                <ActivityLog companyId={record.id} context="company" />
              </TabsContent>
              <TabsContent value="contacts">
                {record.nb_contacts ? (
                  <ReferenceManyField
                    reference="contacts_summary"
                    target="company_id"
                    sort={{ field: "last_name", order: "ASC" }}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-row justify-end space-x-2 mt-1">
                        {!!record.nb_contacts && (
                          <SortButton
                            fields={["last_name", "first_name", "last_seen"]}
                          />
                        )}
                        <CreateRelatedContactButton />
                      </div>
                      <ContactsIterator />
                    </div>
                  </ReferenceManyField>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-row justify-end space-x-2 mt-1">
                      <CreateRelatedContactButton />
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="deals">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-row justify-end space-x-2 mt-1">
                    <CreateRelatedDealButton />
                  </div>
                  {record.nb_deals ? (
                    <ReferenceManyField
                      reference="deals"
                      target="company_id"
                      sort={{ field: "name", order: "ASC" }}
                    >
                      <DealsIterator />
                    </ReferenceManyField>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <CompanyAside />
    </div>
  );
};

const ContactsIterator = () => {
  const location = useLocation();
  const { data: contacts, error, isPending } = useListContext<Contact>();

  if (isPending || error) return null;

  return (
    <div className="pt-0">
      {contacts.map((contact) => (
        <RecordContextProvider key={contact.id} value={contact}>
          <div className="p-0 text-sm">
            <RouterLink
              to={`/contacts/${contact.id}/show`}
              state={{ from: location.pathname }}
              className="flex items-center justify-between hover:bg-muted py-2 transition-colors"
            >
              <div className="mr-4">
                <Avatar />
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-x-4">
                <div className="font-medium truncate">
                  {`${contact.first_name} ${contact.last_name}`}
                </div>
                <div className="text-muted-foreground truncate">
                  {contact.title}
                </div>
                <div className="text-muted-foreground truncate">
                  {contact.email_jsonb?.[0]?.email}
                </div>
                <div className="text-muted-foreground truncate">
                  {contact.phone_jsonb?.[0]?.number}
                </div>
              </div>
            </RouterLink>
          </div>
        </RecordContextProvider>
      ))}
    </div>
  );
};

const CreateRelatedContactButton = () => {
  const translate = useTranslate();
  const company = useRecordContext<Company>();
  return (
    <Button variant="outline" asChild size="sm" className="h-9">
      <RouterLink
        to="/contacts/create"
        state={company ? { record: { company_id: company.id } } : undefined}
        className="flex items-center gap-2"
      >
        <UserPlus className="h-4 w-4" />
        {translate("resources.contacts.action.add")}
      </RouterLink>
    </Button>
  );
};

const CreateRelatedDealButton = () => {
  const translate = useTranslate();
  const location = useLocation();
  const company = useRecordContext<Company>();
  return (
    <Button variant="outline" asChild size="sm" className="h-9">
      <RouterLink
        to="/deals/create"
        state={
          company
            ? {
                record: { company_id: company.id },
                from: location.pathname,
              }
            : undefined
        }
        className="flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        {translate("resources.deals.action.create")}
      </RouterLink>
    </Button>
  );
};

const DealsIterator = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { data: deals, error, isPending } = useListContext<Deal>();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  if (isPending || error) return null;
  return (
    <div>
      <div>
        {deals.map((deal) => (
          <div key={deal.id} className="p-0 text-sm">
            <RouterLink
              to={`/deals/${deal.id}/show`}
              className="flex items-center justify-between hover:bg-muted py-2 px-4 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{deal.name}</div>
                <div className="text-sm text-muted-foreground">
                  {findDealLabel(dealStages, deal.stage)},{" "}
                  {deal.amount.toLocaleString("en-US", {
                    notation: "compact",
                    style: "currency",
                    currency,
                    currencyDisplay: "narrowSymbol",
                    minimumSignificantDigits: 3,
                  })}
                  {deal.category
                    ? `, ${dealCategories.find((c) => c.value === deal.category)?.label ?? deal.category}`
                    : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  {translate("crm.common.last_activity_with_date", {
                    date: formatRelativeDate(deal.updated_at, locale),
                  })}{" "}
                </div>
              </div>
            </RouterLink>
          </div>
        ))}
      </div>
    </div>
  );
};
