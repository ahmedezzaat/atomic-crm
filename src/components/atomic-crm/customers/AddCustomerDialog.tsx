import {
  Form,
  required,
  useDataProvider,
  useNotify,
  useTranslate,
} from "ra-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { SaveButton } from "@/components/admin/form";
import { ReferenceInput } from "@/components/admin/reference-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Marks any existing company as a customer, even without a won deal. */
export const AddCustomerDialog = ({
  open,
  close,
}: {
  open: boolean;
  close: () => void;
}) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const translate = useTranslate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mutate } = useMutation({
    mutationFn: (companyId: number | string) =>
      dataProvider.update("companies", {
        id: companyId,
        data: { is_customer: true },
        previousData: { id: companyId },
      }),
    onSuccess: (_, companyId) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      notify("resources.customers.added", {
        messageArgs: { _: "Customer added" },
      });
      close();
      navigate(`/customers/${companyId}/show`);
    },
    onError: () => notify("ra.notification.http_error", { type: "error" }),
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      {open && (
        <DialogContent className="lg:max-w-xl">
          <Form
            className="flex flex-col gap-4"
            onSubmit={(values: any) => mutate(values.company_id)}
          >
            <DialogHeader>
              <DialogTitle>
                {translate("resources.customers.add", { _: "Add customer" })}
              </DialogTitle>
            </DialogHeader>
            <ReferenceInput source="company_id" reference="companies">
              <AutocompleteInput
                label="Company"
                optionText="name"
                helperText={false}
                validate={required()}
              />
            </ReferenceInput>
            <DialogFooter className="w-full justify-end">
              <SaveButton />
            </DialogFooter>
          </Form>
        </DialogContent>
      )}
    </Dialog>
  );
};
