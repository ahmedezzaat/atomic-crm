import { useCreate, useNotify } from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { Company } from "../types";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { fillPlaceholders, measureSms } from "./smsUtils";

/** Sends one SMS to a company; it is tracked like any other campaign. */
export const SendSmsDialog = ({
  company,
  open,
  close,
}: {
  company: Company;
  open: boolean;
  close: () => void;
}) => {
  const notify = useNotify();
  const { smsSenders } = useConfigurationContext();
  const [create] = useCreate();
  const [sender, setSender] = useState(smsSenders[0]?.label ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const sms = measureSms(message);
  const preview = fillPlaceholders(message, {
    name: company.name,
    city: company.city ?? "",
  });

  const send = async () => {
    setBusy(true);
    try {
      const campaign = await create(
        "sms_campaigns",
        {
          data: {
            name: `SMS to ${company.name}`,
            sender_id: sender,
            message,
            audience: { company_id: String(company.id) },
            recipients: 1,
            status: "scheduled",
          },
        },
        { returnPromise: true },
      );
      const { error } = await getSupabaseClient().functions.invoke("sms_send", {
        method: "POST",
        body: { campaign_id: campaign.id },
      });
      if (error) {
        const detail = await (error as any).context?.json?.().catch(() => null);
        throw new Error(detail?.message ?? error.message);
      }
      notify(
        `SMS is being sent to ${company.name}. See SMS to follow delivery.`,
      );
      setMessage("");
      close();
    } catch (e) {
      notify(`Could not send: ${(e as Error).message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="lg:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send SMS to {company.name}</DialogTitle>
          <DialogDescription dir="ltr">
            {company.phone_number}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Sender name</Label>
            <Select value={sender} onValueChange={setSender}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a sender" />
              </SelectTrigger>
              <SelectContent>
                {smsSenders.map((s) => (
                  <SelectItem key={s.value} value={s.label}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Message</Label>
            <Textarea
              rows={5}
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hello {{name}}, ..."
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Use {"{{name}}"} and {"{{city}}"} to personalise.
              </span>
              <span>
                {sms.length} characters · {sms.segments}{" "}
                {sms.segments === 1 ? "message" : "messages"}
                {sms.unicode ? " · Arabic/Unicode" : ""}
              </span>
            </div>
          </div>
          {message && (
            <div
              className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap break-words"
              dir="auto"
            >
              {preview}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy || !message.trim() || !sender} onClick={send}>
            {busy ? "Sending…" : "Send SMS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
