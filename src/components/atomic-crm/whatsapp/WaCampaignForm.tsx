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

import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { waStatusLabel, type WaAudience, type WaCampaign } from "./waUtils";

const ANY = "__all";

type Draft = {
  name: string;
  template_name: string;
  template_language: string;
  with_name: boolean;
  daily_cap: number;
  auto_daily: boolean;
  send_hour: number;
  audience: Required<WaAudience>;
};

const emptyDraft = (): Draft => ({
  name: "",
  template_name: "",
  template_language: "ar",
  with_name: true,
  daily_cap: 50,
  auto_daily: false,
  send_hour: 10,
  audience: {
    lead_source: ANY,
    tag: ANY,
    city: ANY,
    country: ANY,
    competitor: ANY,
  },
});

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
    companyLeadSources,
  } = useConfigurationContext();
  const [create] = useCreate();
  const [update] = useUpdate();
  const { data: tags = [] } = useGetList("company_tags", {
    pagination: { page: 1, perPage: 100 },
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [eligible, setEligible] = useState<number>();
  const [sent24h, setSent24h] = useState(0);

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
      daily_cap: saved.daily_cap,
      auto_daily: saved.auto_daily,
      send_hour: saved.send_hour,
      audience: { ...emptyDraft().audience, ...saved.audience },
    });
    // load once per campaign id, not on every refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id]);

  const audience = Object.fromEntries(
    Object.entries(draft.audience).filter(([, v]) => v !== ANY),
  );
  const audienceKey = JSON.stringify(audience);

  const loadPreview = () =>
    invoke<{ eligible: number; sent_24h: number }>({
      action: "preview",
      audience: JSON.parse(audienceKey),
    })
      .then((r) => {
        setEligible(r.eligible);
        setSent24h(r.sent_24h);
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
  const setAudience = (key: keyof Draft["audience"], value: string) =>
    setDraft((d) => ({ ...d, audience: { ...d.audience, [key]: value } }));

  const valid =
    draft.name.trim() !== "" &&
    draft.template_name.trim() !== "" &&
    draft.daily_cap >= 1 &&
    (eligible ?? 0) > 0;
  const room = Math.max(0, draft.daily_cap - sent24h);
  const batchSize = Math.min(room, eligible ?? 0);

  const save = async (): Promise<number> => {
    const data = {
      name: draft.name.trim(),
      template_name: draft.template_name.trim(),
      template_language: draft.template_language.trim() || "ar",
      with_name: draft.with_name,
      daily_cap: draft.daily_cap,
      auto_daily: draft.auto_daily,
      send_hour: draft.send_hour,
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
      }>({ campaign_id: campaignId });
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
      <Select
        value={draft.audience[field]}
        onValueChange={(v) => setAudience(field, v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
              </div>
              <p className="text-xs text-muted-foreground">
                Never included: companies that replied STOP, companies without a
                valid phone number, and numbers that already got a WhatsApp
                message from you.
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
              {draft.auto_daily && (
                <div className="flex items-center gap-2">
                  <span>at</span>
                  <select
                    value={draft.send_hour}
                    onChange={(e) => set("send_hour", Number(e.target.value))}
                    className="h-9 rounded-md border bg-background px-2"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">Cairo time</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sent in last 24h</span>
                <span>{sent24h}</span>
              </div>
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
              Send next batch
            </Button>
          </div>
          {valid && batchSize === 0 && (
            <p className="text-xs text-muted-foreground">
              Daily limit reached. You can send the next batch later.
            </p>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this batch?</DialogTitle>
            <DialogDescription>
              {batchSize} companies will receive the template "
              {draft.template_name}" on WhatsApp now. Each message is billed by
              Meta and can't be recalled.
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
