import { required, useNotify, useTranslate, type Identifier } from "ra-core";
import { CreateBase, EditBase, Form } from "ra-core";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { DateInput } from "@/components/admin/date-input";
import { DeleteButton } from "@/components/admin/delete-button";
import { SaveButton } from "@/components/admin/form";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useConfigurationContext } from "../root/ConfigurationContext";

const validateDates = (_: unknown, values: Record<string, any>) =>
  values.start_date && values.end_date && values.end_date < values.start_date
    ? {
        message: "resources.subscriptions.end_before_start",
        args: { _: "End date must be after the start date" },
      }
    : undefined;

const SubscriptionInputs = ({
  selectCustomer,
}: {
  selectCustomer: boolean;
}) => {
  const { subscriptionProducts, currency } = useConfigurationContext();
  return (
    <div className="flex flex-col gap-4">
      {selectCustomer && (
        <ReferenceInput source="company_id" reference="customers">
          <AutocompleteInput
            label="Company"
            optionText="name"
            helperText={false}
            validate={required()}
          />
        </ReferenceInput>
      )}
      <SelectInput
        source="product"
        choices={subscriptionProducts}
        optionText="label"
        optionValue="value"
        validate={required()}
        helperText={false}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateInput
          source="start_date"
          validate={required()}
          helperText={false}
        />
        <DateInput
          source="end_date"
          validate={[required(), validateDates]}
          helperText={false}
        />
        <NumberInput
          source="value"
          label={`${"Value"} (${currency})`}
          validate={required()}
          min={0}
          helperText={false}
        />
        <NumberInput
          source="nb_users"
          validate={required()}
          min={0}
          helperText={false}
        />
      </div>
    </div>
  );
};

export const SubscriptionCreateDialog = ({
  open,
  close,
  companyId,
}: {
  open: boolean;
  close: () => void;
  companyId?: Identifier;
}) => {
  const notify = useNotify();
  const translate = useTranslate();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Dialog open={open} onOpenChange={close}>
      {open && (
        <CreateBase
          resource="subscriptions"
          record={{
            company_id: companyId,
            start_date: today,
            nb_users: 1,
            value: 0,
          }}
          redirect={false}
          mutationOptions={{
            onSuccess: () => {
              close();
              notify("resources.subscriptions.added", {
                messageArgs: { _: "Subscription added" },
              });
            },
          }}
        >
          <DialogContent className="lg:max-w-xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
            <Form className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>
                  {translate("resources.subscriptions.create", {
                    _: "Add subscription",
                  })}
                </DialogTitle>
              </DialogHeader>
              <SubscriptionInputs selectCustomer={companyId == null} />
              <DialogFooter className="w-full justify-end">
                <SaveButton />
              </DialogFooter>
            </Form>
          </DialogContent>
        </CreateBase>
      )}
    </Dialog>
  );
};

export const SubscriptionEditDialog = ({
  id,
  open,
  close,
}: {
  id: Identifier;
  open: boolean;
  close: () => void;
}) => {
  const notify = useNotify();
  const translate = useTranslate();
  return (
    <Dialog open={open} onOpenChange={close}>
      {open && (
        <EditBase
          resource="subscriptions"
          id={id}
          redirect={false}
          mutationOptions={{
            onSuccess: () => {
              close();
              notify("resources.subscriptions.updated", {
                messageArgs: { _: "Subscription updated" },
              });
            },
          }}
        >
          <DialogContent className="lg:max-w-xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
            <Form className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>
                  {translate("resources.subscriptions.edit", {
                    _: "Edit subscription",
                  })}
                </DialogTitle>
              </DialogHeader>
              <SubscriptionInputs selectCustomer={false} />
              <DialogFooter className="w-full sm:justify-between gap-4">
                <DeleteButton
                  redirect={false}
                  mutationOptions={{ onSuccess: close }}
                />
                <SaveButton label="ra.action.save" />
              </DialogFooter>
            </Form>
          </DialogContent>
        </EditBase>
      )}
    </Dialog>
  );
};
