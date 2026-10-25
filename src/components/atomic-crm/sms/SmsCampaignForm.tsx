import { ArrowLeft } from "lucide-react";
import {
  useCreate,
  useGetList,
  useGetOne,
  useNotify,
  useUpdate,
} from "ra-core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { sizes } from "../companies/sizes";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import {
  ANY,
  fillPlaceholders,
  measureSms,
  statusLabel,
  type SmsAudience,
  type SmsCampaign,
  type SmsMessage,
} from "./smsUtils";

type Draft = {
  name: string;
  sender_id: string;
  message: string;
  audience: Required<Omit<SmsAudience, "company_id">>;
  schedule: "now" | "later";
  schedule_at: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  sender_id: "Kords",
  message: "",
  audience: { city: ANY, sector: ANY, competitor: ANY, size: ANY },
  schedule: "now",
  schedule_at: "",
});

// datetime-local works in local time, the database stores UTC
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export const SmsCampaignForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { companyCities, companySectors, companyCompetitors, smsSenders } =
    useConfigurationContext();
  const [create] = useCreate();
  const [update] = useUpdate();

  const [draft, setDraft] = useState<Draft>(() => ({
    ...emptyDraft(),
    sender_id: smsSenders[0]?.label ?? "",
  }));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: saved } = useGetOne<SmsCampaign>(
    "sms_campaigns",
    { id: Number(id) },
    {
      enabled: !!id,
      refetchInterval: (q) =>
        q.state.data?.status === "sending" ? 3000 : false,
    },
  );
  const locked =
    !!saved && (saved.status === "sending" || saved.status === "sent");

  useEffect(() => {
    if (!saved) return;
    setDraft({
      name: saved.name,
      sender_id: saved.sender_id,
      message: saved.message,
      audience: { ...emptyDraft().audience, ...saved.audience },
      schedule: saved.schedule_at ? "later" : "now",
      schedule_at: toLocalInput(saved.schedule_at),
    });
    // load once per campaign id, not on every status refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id]);

  const { data: messages = [] } = useGetList<SmsMessage>(
    "sms_messages",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "id", order: "ASC" },
      filter: { campaign_id: id },
    },
    {
      enabled: !!id && saved?.status !== "draft",
      refetchInterval: saved?.status === "sending" ? 3000 : false,
    },
  );

  // An old campaign may use a sender that is no longer in the list
  const senderChoices = [
    ...new Set([...smsSenders.map((s) => s.label), draft.sender_id]),
  ].filter(Boolean);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setAudience = (key: keyof Draft["audience"], value: string) =>
    setDraft((d) => ({ ...d, audience: { ...d.audience, [key]: value } }));

  // Live audience size: companies matching the chosen filters that have a phone
  const filter = Object.fromEntries(
    Object.entries(draft.audience)
      .filter(([, v]) => v !== ANY)
      .map(([k, v]) => [k, k === "size" ? Number(v) : v]),
  );
  const { total: recipients = 0, isPending: countPending } = useGetList(
    "companies",
    { pagination: { page: 1, perPage: 1 }, filter },
  );

  const sms = measureSms(draft.message);
  const sample = fillPlaceholders(draft.message, {
    name: "Najd Real Estate",
    city: "October",
  });
  const valid =
    draft.name.trim() !== "" &&
    draft.sender_id.trim() !== "" &&
    draft.message.trim() !== "" &&
    recipients > 0 &&
    (draft.schedule === "now" || !!draft.schedule_at);

  const payload = (status: "draft" | "scheduled") => ({
    name: draft.name.trim(),
    sender_id: draft.sender_id.trim(),
    message: draft.message,
    audience: Object.fromEntries(
      Object.entries(draft.audience).filter(([, v]) => v !== ANY),
    ),
    schedule_at:
      draft.schedule === "later" && draft.schedule_at
        ? new Date(draft.schedule_at).toISOString()
        : null,
    recipients,
    status,
  });

  const save = async (status: "draft" | "scheduled"): Promise<number> => {
    const data = payload(status);
    if (id) {
      await update(
        "sms_campaigns",
        { id, data, previousData: saved },
        { returnPromise: true },
      );
      return Number(id);
    }
    const created = await create(
      "sms_campaigns",
      { data },
      { returnPromise: true },
    );
    return created.id as number;
  };

  const saveDraft = async () => {
    setBusy(true);
    try {
      await save("draft");
      notify("Draft saved");
      navigate("/sms");
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const campaignId = await save("scheduled");
      const { error } = await getSupabaseClient().functions.invoke("sms_send", {
        method: "POST",
        body: { campaign_id: campaignId },
      });
      if (error) {
        const detail = await (error as any).context?.json?.().catch(() => null);
        throw new Error(detail?.message ?? error.message);
      }
      notify(
        draft.schedule === "now"
          ? "Campaign is being sent"
          : "Campaign scheduled with the SMS provider",
      );
      setConfirming(false);
      navigate("/sms");
    } catch (e) {
      notify(`Could not send: ${(e as Error).message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const options = (
    list: { value: string; label: string }[],
    valueKey: "value" | "label" = "label",
  ) =>
    list.map((o) => (
      <SelectItem key={o.value} value={o[valueKey]}>
        {o.label}
      </SelectItem>
    ));

  const audienceSelect = (
    label: string,
    field: keyof Draft["audience"],
    children: React.ReactNode,
  ) => (
    <div key={field} className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select
        value={draft.audience[field]}
        onValueChange={(v) => setAudience(field, v)}
        disabled={locked}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );

  const nbFailed = messages.filter((m) =>
    ["failed", "undelivered"].includes(m.status),
  ).length;

  return (
    <div className="mt-2 flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sms")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">
          {id ? "Campaign" : "New SMS campaign"}
        </h1>
        {saved && <Badge variant="outline">{statusLabel[saved.status]}</Badge>}
      </div>

      {saved?.status === "failed" && saved.error && (
        <Card>
          <CardContent className="text-sm text-destructive">
            Last attempt failed: {saved.error}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sms-name">Campaign name</Label>
                  <Input
                    id="sms-name"
                    value={draft.name}
                    disabled={locked}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. October brokers offer"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Sender name</Label>
                  <Select
                    value={draft.sender_id}
                    onValueChange={(v) => set("sender_id", v)}
                    disabled={locked}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a sender" />
                    </SelectTrigger>
                    <SelectContent>
                      {senderChoices.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Audience</h2>
                <span className="text-sm text-muted-foreground">
                  {countPending
                    ? "Counting…"
                    : `${recipients} ${recipients === 1 ? "company" : "companies"} match`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {audienceSelect("City", "city", options(companyCities))}
                {audienceSelect(
                  "Sector",
                  "sector",
                  options(companySectors, "value"),
                )}
                {audienceSelect(
                  "Competitor system",
                  "competitor",
                  options(companyCompetitors, "value"),
                )}
                {audienceSelect(
                  "Company size",
                  "size",
                  sizes.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  )),
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Messages go to each company's phone number. Companies without a
                valid phone number are skipped when sending.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Message</h2>
              <Textarea
                rows={6}
                value={draft.message}
                disabled={locked}
                onChange={(e) => set("message", e.target.value)}
                placeholder="Hello {{name}}, ..."
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex gap-2">
                  {["{{name}}", "{{city}}"].map((token) => (
                    <Button
                      key={token}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => set("message", draft.message + token)}
                    >
                      {token}
                    </Button>
                  ))}
                </div>
                <span className="text-muted-foreground">
                  {sms.length} characters · {sms.segments}{" "}
                  {sms.segments === 1 ? "message" : "messages"} per recipient
                  {sms.unicode ? " · Arabic/Unicode" : ""}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Schedule</h2>
              <div className="flex flex-wrap items-end gap-6">
                {(["now", "later"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="schedule"
                      disabled={locked}
                      checked={draft.schedule === value}
                      onChange={() => set("schedule", value)}
                    />
                    {value === "now" ? "Send now" : "Schedule for later"}
                  </label>
                ))}
                {draft.schedule === "later" && (
                  <Input
                    type="datetime-local"
                    className="w-60"
                    disabled={locked}
                    value={draft.schedule_at}
                    onChange={(e) => set("schedule_at", e.target.value)}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {saved && saved.status !== "draft" && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Delivery</h2>
                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  {[
                    ["Recipients", messages.length],
                    [
                      "Sent",
                      messages.filter(
                        (m) => m.status !== "failed" && m.status !== "pending",
                      ).length,
                    ],
                    [
                      "Delivered",
                      messages.filter((m) => m.status === "delivered").length,
                    ],
                    ["Failed", nbFailed],
                  ].map(([label, value]) => (
                    <div
                      key={label as string}
                      className="rounded-md bg-muted p-2"
                    >
                      <div className="text-lg font-semibold">{value}</div>
                      <div className="text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
                {nbFailed > 0 && (
                  <div className="max-h-48 overflow-auto text-sm">
                    {messages
                      .filter((m) =>
                        ["failed", "undelivered"].includes(m.status),
                      )
                      .map((m) => (
                        <div
                          key={m.id}
                          className="flex justify-between border-b py-1"
                        >
                          <span dir="ltr">{m.phone}</span>
                          <span className="text-muted-foreground">
                            {m.error ?? m.status}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Preview</h2>
              <div
                className="rounded-xl bg-muted p-3 text-sm min-h-24 whitespace-pre-wrap break-words"
                dir="auto"
              >
                {sample || (
                  <span className="text-muted-foreground">
                    Your message appears here
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                From: {draft.sender_id || "—"} · Sample recipient: Najd Real
                Estate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 text-sm">
              <h2 className="text-lg font-semibold">Summary</h2>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipients</span>
                <span>{recipients}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Messages each</span>
                <span>{sms.segments}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total messages</span>
                <span>{recipients * sms.segments}</span>
              </div>
            </CardContent>
          </Card>

          {!locked && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy || draft.name.trim() === ""}
                onClick={saveDraft}
              >
                Save draft
              </Button>
              <Button
                className="flex-1"
                disabled={busy || !valid}
                onClick={() => setConfirming(true)}
              >
                {draft.schedule === "now" ? "Send campaign" : "Schedule"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draft.schedule === "now"
                ? "Send this campaign?"
                : "Schedule this campaign?"}
            </DialogTitle>
            <DialogDescription>
              Up to {recipients} companies will receive {sms.segments}{" "}
              {sms.segments === 1 ? "message" : "messages"} each (
              {recipients * sms.segments} in total). Each message uses SMS
              credits and can't be recalled once sent.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={send}>
              {busy ? "Sending…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SmsCampaignForm;
