import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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

import { sizes } from "../companies/sizes";
import { MultiSelect } from "./MultiSelect";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { waStatusLabel, type WaCampaign, type WaFollowup } from "./waUtils";

type AudienceField =
  | "lead_source"
  | "tag"
  | "city"
  | "country"
  | "competitor"
  | "sector"
  | "size"
  | "sales_id";

const toList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .map(String)
    .filter((x) => x && x !== "__all");

type Draft = {
  name: string;
  template_name: string;
  template_language: string;
  with_name: boolean;
  header_image_url: string;
  daily_cap: number;
  auto_daily: boolean;
  send_from_hour: number;
  send_to_hour: number;
  followups: WaFollowup[];
  audience: Record<AudienceField, string[]>;
  new_only: boolean;
};

const emptyDraft = (): Draft => ({
  name: "",
  template_name: "",
  template_language: "ar",
  with_name: true,
  header_image_url: "",
  daily_cap: 50,
  auto_daily: false,
  send_from_hour: 11,
  send_to_hour: 20,
  followups: [],
  new_only: false,
  audience: {
    lead_source: [],
    tag: [],
    city: [],
    country: [],
    competitor: [],
    sector: [],
    size: [],
    sales_id: [],
  },
});

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

const cairoHour = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );

const invoke = async <T,>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabaseClient().functions.invoke<T>(
    "wa_campaign_send",
    { method: "POST", body },
  );
  if (error || !data) {
    const detail = await (error as any)?.context?.json?.().catch(() => null);
    throw new Error(detail?.message ?? error?.message ?? "Request failed");
  }
  return data;
};

export const WaCampaignForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const {
    companyCities,
    companyCountries,
    companyCompetitors,
    companySectors,
    companyLeadSources,
  } = useConfigurationContext();
  const [create] = useCreate();
  const [update] = useUpdate();
  const { data: salesPeople = [] } = useGetList("sales", {
    pagination: { page: 1, perPage: 100 },
  });
  const { data: tags = [] } = useGetList("company_tags", {
    pagination: { page: 1, perPage: 100 },
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [eligible, setEligible] = useState<number>();
  const [sent24h, setSent24h] = useState(0);
  const [followupsDue, setFollowupsDue] = useState(0);
  const [followupsWaiting, setFollowupsWaiting] = useState(0);

  const { data: saved, refetch } = useGetOne<WaCampaign>(
    "wa_campaigns",
    { id: Number(id) },
    { enabled: !!id },
  );

  useEffect(() => {
    if (!saved) return;
    setDraft({
      name: saved.name,
      template_name: saved.template_name,
      template_language: saved.template_language,
      with_name: saved.with_name,
      header_image_url: saved.header_image_url ?? "",
      daily_cap: saved.daily_cap,
      auto_daily: saved.auto_daily,
      send_from_hour: saved.send_from_hour,
      send_to_hour: saved.send_to_hour,
      followups: saved.followups ?? [],
      audience: Object.fromEntries(
        Object.keys(emptyDraft().audience).map((k) => [
          k,
          toList((saved.audience as Record<string, unknown>)?.[k]),
        ]),
      ) as Draft["audience"],
      new_only: saved.audience?.new_only === true,
    });
    // load once per campaign id, not on every refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id]);

  const audience = {
    ...Object.fromEntries(
      Object.entries(draft.audience).filter(([, v]) => v.length > 0),
    ),
    ...(draft.new_only ? { new_only: true } : {}),
  };
  const audienceKey = JSON.stringify(audience);

  const loadPreview = () =>
    invoke<{
      eligible: number;
      sent_24h: number;
      followups_due: number;
      followups_waiting: number;
    }>({
      action: "preview",
      audience: JSON.parse(audienceKey),
      campaign_id: id ? Number(id) : undefined,
    })
      .then((r) => {
        setEligible(r.eligible);
        setSent24h(r.sent_24h);
        setFollowupsDue(r.followups_due);
        setFollowupsWaiting(r.followups_waiting);
      })
      .catch(() => setEligible(undefined));

  useEffect(() => {
    setEligible(undefined);
    const t = setTimeout(loadPreview, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setFollowup = (index: number, patch: Partial<WaFollowup>) =>
    setDraft((d) => ({
      ...d,
      followups: d.followups.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      ),
    }));
  const addFollowup = () =>
    setDraft((d) => ({
      ...d,
      followups: [
        ...d.followups,
        {
          after_hours: d.followups.length ? 72 : 48,
          template_name: "",
          template_language: d.template_language || "ar",
          with_name: d.with_name,
        },
      ],
    }));
  const removeFollowup = (index: number) =>
    setDraft((d) => ({
      ...d,
      followups: d.followups.filter((_, i) => i !== index),
    }));
  const setAudience = (key: keyof Draft["audience"], value: string[]) =>
    setDraft((d) => ({ ...d, audience: { ...d.audience, [key]: value } }));

  const valid =
    draft.name.trim() !== "" &&
    draft.template_name.trim() !== "" &&
    draft.daily_cap >= 1 &&
    draft.send_from_hour < draft.send_to_hour &&
    draft.followups.every(
      (f) => f.template_name.trim() !== "" && f.after_hours >= 1,
    ) &&
    (eligible ?? 0) + followupsDue > 0;
  const room = Math.max(0, draft.daily_cap - sent24h);
  const batchSize = Math.min(room, (eligible ?? 0) + followupsDue);
  const hourNow = cairoHour();
  const windowOpen =
    hourNow >= draft.send_from_hour && hourNow < draft.send_to_hour;

  const save = async (): Promise<number> => {
    const data = {
      name: draft.name.trim(),
      template_name: draft.template_name.trim(),
      template_language: draft.template_language.trim() || "ar",
      with_name: draft.with_name,
      header_image_url: draft.header_image_url.trim(),
      daily_cap: draft.daily_cap,
      auto_daily: draft.auto_daily,
      send_from_hour: draft.send_from_hour,
      send_to_hour: draft.send_to_hour,
      followups: draft.followups.map((f) => ({
        ...f,
        template_name: f.template_name.trim(),
        template_language: f.template_language.trim() || "ar",
        header_image_url: (f.header_image_url ?? "").trim(),
      })),
      audience,
    };
    if (draft.auto_daily) await invoke({ action: "arm" });
    if (id) {
      await update(
        "wa_campaigns",
        { id, data, previousData: saved },
        { returnPromise: true },
      );
      return Number(id);
    }
    const created = await create(
      "wa_campaigns",
      { data },
      { returnPromise: true },
    );
    return created.id as number;
  };

  const saveOnly = async () => {
    setBusy(true);
    try {
      await save();
      notify("Saved");
      navigate("/wa-campaigns");
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const sendBatch = async () => {
    setBusy(true);
    try {
      const campaignId = await save();
      const r = await invoke<{
        sent: number;
        failed: number;
        remaining: number;
        message?: string;
        error?: string | null;
      }>({ campaign_id: campaignId, ignore_hours: !windowOpen });
      notify(
        r.message ??
          `${r.sent} sent${r.failed ? `, ${r.failed} failed (${r.error})` : ""}. ${r.remaining} still waiting.`,
        { type: r.failed && !r.sent ? "error" : "success" },
      );
      setConfirming(false);
      if (!id) navigate(`/wa-campaigns/${campaignId}`);
      else {
        refetch();
        loadPreview();
      }
    } catch (e) {
      notify(`Could not send: ${(e as Error).message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const pick = (
    label: string,
    field: keyof Draft["audience"],
    items: { value: string; label: string }[],
  ) => (
    <div key={field} className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <MultiSelect
        options={items}
        value={draft.audience[field]}
        onChange={(v) => setAudience(field, v)}
      />
    </div>
  );

  const stat = (label: string, value?: number) => (
    <div key={label} className="rounded-md bg-muted p-2">
      <div className="text-lg font-semibold">{value ?? 0}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <div className="mt-2 flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/wa-campaigns")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">
          {id ? "WhatsApp campaign" : "New WhatsApp campaign"}
        </h1>
        {saved && (
          <Badge variant="outline">{waStatusLabel[saved.status]}</Badge>
        )}
      </div>

      {saved?.error && (
        <Card>
          <CardContent className="text-sm text-destructive">
            Last problem: {saved.error}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Template</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wa-name">Campaign name</Label>
                  <Input
                    id="wa-name"
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. October developers intro"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wa-tpl">Approved template name</Label>
                  <Input
                    id="wa-tpl"
                    dir="ltr"
                    value={draft.template_name}
                    onChange={(e) => set("template_name", e.target.value)}
                    placeholder="intro_developers"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wa-lang">Template language code</Label>
                  <Input
                    id="wa-lang"
                    dir="ltr"
                    value={draft.template_language}
                    onChange={(e) => set("template_language", e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.with_name}
                    onChange={(e) => set("with_name", e.target.checked)}
                  />
                  The template has {"{{1}}"} for the company name
                </label>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor="wa-img">
                    Header media link (only if the template has an image, video
                    or document header)
                  </Label>
                  <Input
                    id="wa-img"
                    dir="ltr"
                    value={draft.header_image_url}
                    onChange={(e) => set("header_image_url", e.target.value)}
                    placeholder="https://yourwebsite.com/intro.jpg"
                  />
                  <p className="text-xs text-muted-foreground">
                    A public https link that anyone can open: a JPG or PNG (up
                    to 5 MB), an MP4 video (H.264, up to 16 MB) or a PDF. It
                    must match the template's header type. Meta needs it with
                    every message, so a template with a media header fails
                    without it.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Use the exact name and language of a template approved in Meta
                WhatsApp Manager. It should say who you are and how to stop (for
                example "reply STOP").
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Audience</h2>
                <span className="text-sm text-muted-foreground">
                  {eligible === undefined
                    ? "Counting…"
                    : `${eligible} can be messaged`}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {pick("Lead source", "lead_source", companyLeadSources)}
                {pick(
                  "Tag",
                  "tag",
                  tags.map((t: any) => ({
                    value: String(t.id),
                    label: t.name,
                  })),
                )}
                {pick(
                  "City",
                  "city",
                  companyCities.map((c) => ({
                    value: c.label,
                    label: c.label,
                  })),
                )}
                {pick(
                  "Country",
                  "country",
                  companyCountries.map((c) => ({
                    value: c.label,
                    label: c.label,
                  })),
                )}
                {pick("Competitor system", "competitor", companyCompetitors)}
                {pick("Sector", "sector", companySectors)}
                {pick(
                  "Company size",
                  "size",
                  sizes.map((z) => ({ value: String(z.id), label: z.name })),
                )}
                {pick(
                  "Assigned to",
                  "sales_id",
                  salesPeople.map((u: any) => ({
                    value: String(u.id),
                    label: `${u.first_name} ${u.last_name}`.trim(),
                  })),
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.new_only}
                  onChange={(e) => set("new_only", e.target.checked)}
                />
                Only companies with no deal and not a customer
              </label>
              <p className="text-xs text-muted-foreground">
                Never included: companies that replied STOP, companies without a
                valid phone number, and numbers that already got a WhatsApp
                message from you.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Follow-ups</h2>
                {draft.followups.length < 2 && (
                  <Button variant="outline" size="sm" onClick={addFollowup}>
                    <Plus className="h-4 w-4" />
                    Add follow-up
                  </Button>
                )}
              </div>
              {draft.followups.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No follow-ups. People who don't reply get only the first
                  message.
                </p>
              )}
              {draft.followups.map((f, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Follow-up {i + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove follow-up ${i + 1}`}
                      onClick={() => removeFollowup(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>If no reply</span>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      className="w-20"
                      aria-label={`Follow-up ${i + 1} hours`}
                      value={f.after_hours}
                      onChange={(e) =>
                        setFollowup(i, { after_hours: Number(e.target.value) })
                      }
                    />
                    <span>
                      hours after{" "}
                      {i === 0 ? "the first message" : "follow-up 1"}, send:
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`wa-fu-tpl-${i}`}>
                        Approved template name
                      </Label>
                      <Input
                        id={`wa-fu-tpl-${i}`}
                        dir="ltr"
                        value={f.template_name}
                        onChange={(e) =>
                          setFollowup(i, { template_name: e.target.value })
                        }
                        placeholder="kords_followup_1"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`wa-fu-lang-${i}`}>Language code</Label>
                      <Input
                        id={`wa-fu-lang-${i}`}
                        dir="ltr"
                        value={f.template_language}
                        onChange={(e) =>
                          setFollowup(i, { template_language: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={f.with_name}
                      onChange={(e) =>
                        setFollowup(i, { with_name: e.target.checked })
                      }
                    />
                    The template has {"{{1}}"} for the company name
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`wa-fu-img-${i}`}>
                      Header media link (only if it has a media header)
                    </Label>
                    <Input
                      id={`wa-fu-img-${i}`}
                      dir="ltr"
                      value={f.header_image_url ?? ""}
                      onChange={(e) =>
                        setFollowup(i, { header_image_url: e.target.value })
                      }
                      placeholder="https://yourwebsite.com/followup.jpg"
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                A follow-up goes only to people whose earlier message was
                delivered and who have not replied, tapped stop or got a deal.
                It needs the WhatsApp webhook (Settings) to see deliveries and
                replies. Follow-ups count towards the daily limit and go before
                new companies, during the sending hours. Turn on automatic
                sending so they go out without clicking.
              </p>
            </CardContent>
          </Card>

          {saved && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Results</h2>
                <div className="grid grid-cols-5 gap-2 text-center text-sm">
                  {stat("Sent", saved.nb_sent)}
                  {stat("Delivered", saved.nb_delivered)}
                  {stat("Read", saved.nb_read)}
                  {stat("Replied", saved.nb_replied)}
                  {stat("Failed", saved.nb_failed)}
                </div>
                {saved.followups?.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 text-center text-sm">
                    {stat("Follow-ups sent", saved.nb_followups)}
                    {stat(
                      "Replied after a follow-up",
                      saved.nb_replied_after_followup,
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 text-sm">
              <h2 className="text-lg font-semibold">Daily limit</h2>
              <Input
                type="number"
                min={1}
                max={1000}
                value={draft.daily_cap}
                onChange={(e) => set("daily_cap", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Maximum new conversations per 24 hours across all campaigns.
                Start low (about 50) so Meta sees good replies before you raise
                it.
              </p>
              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={draft.auto_daily}
                  onChange={(e) => set("auto_daily", e.target.checked)}
                />
                Send the next batch automatically every day
              </label>
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="font-medium">Sending hours</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span>from</span>
                  <select
                    aria-label="Send from"
                    value={draft.send_from_hour}
                    onChange={(e) =>
                      set("send_from_hour", Number(e.target.value))
                    }
                    className="h-9 rounded-md border bg-background px-2"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                  <span>to</span>
                  <select
                    aria-label="Send until"
                    value={draft.send_to_hour}
                    onChange={(e) =>
                      set("send_to_hour", Number(e.target.value))
                    }
                    className="h-9 rounded-md border bg-background px-2"
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">Cairo time</span>
                </div>
                {draft.send_from_hour >= draft.send_to_hour ? (
                  <p className="text-xs text-destructive">
                    The end time must be after the start time.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No messages go out outside these hours.
                    {draft.auto_daily &&
                      " The daily batch is spread over them, a share every hour."}
                  </p>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sent in last 24h</span>
                <span>{sent24h}</span>
              </div>
              {draft.followups.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Follow-ups due now
                    </span>
                    <span>{followupsDue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Waiting for a follow-up
                    </span>
                    <span>{followupsWaiting}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-medium">
                <span>Next batch</span>
                <span>{batchSize}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy || draft.name.trim() === ""}
              onClick={saveOnly}
            >
              Save
            </Button>
            <Button
              className="flex-1"
              disabled={busy || !valid || batchSize === 0}
              onClick={() => setConfirming(true)}
            >
              {windowOpen ? "Send next batch" : "Send now"}
            </Button>
          </div>
          {valid && batchSize === 0 && (
            <p className="text-xs text-muted-foreground">
              Daily limit reached. You can send the next batch later.
            </p>
          )}
          {valid && batchSize > 0 && !windowOpen && (
            <p className="text-xs text-muted-foreground">
              Outside the sending hours ({hourLabel(draft.send_from_hour)} to{" "}
              {hourLabel(draft.send_to_hour)} Cairo time). Automatic sending
              waits for them. "Send now" sends a batch anyway.
            </p>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this batch?</DialogTitle>
            <DialogDescription>
              {batchSize} companies will receive a WhatsApp template now
              {followupsDue > 0
                ? ` (${Math.min(followupsDue, batchSize)} of them a follow-up)`
                : ` ("${draft.template_name}")`}
              . Each message is billed by Meta and can't be recalled.
              {!windowOpen &&
                " This is outside the campaign's sending hours, so people may get it at an odd time."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={sendBatch}>
              {busy ? "Sending…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WaCampaignForm;
