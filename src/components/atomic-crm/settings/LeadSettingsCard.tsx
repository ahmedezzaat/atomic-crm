import { Copy } from "lucide-react";
import { useNotify } from "ra-core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getSupabaseClient } from "../providers/supabase/supabase";

type Hint = { set: boolean; hint: string };
type Status = {
  access_token: Hint;
  app_secret: Hint;
  lead_api_key: Hint;
  new_lead_key?: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  template_has_name: boolean;
  verify_token: string;
  webhook_url: string;
  lead_url: string;
};

const SECRETS = [
  {
    key: "access_token",
    label: "Access token",
    help: "A permanent token from a System User in Meta Business settings, with the whatsapp_business_messaging permission.",
  },
  {
    key: "app_secret",
    label: "App secret",
    help: "From your Meta app: Settings → Basic. Used to check that replies really come from Meta.",
  },
] as const;

const CopyRow = ({ label, value }: { label: string; value: string }) => {
  const notify = useNotify();
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          readOnly
          dir="ltr"
          value={value}
          className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            notify("Copied");
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

/**
 * WhatsApp (Meta Cloud API) and lead capture settings. Secrets are sent to the
 * server and never read back: only whether each is saved and its last 4 characters.
 */
export const LeadSettingsCard = () => {
  const notify = useNotify();
  const [status, setStatus] = useState<Status>();
  const [secrets, setSecrets] = useState({ access_token: "", app_secret: "" });
  const [plain, setPlain] = useState({
    phone_number_id: "",
    template_name: "",
    template_language: "",
    template_has_name: "yes",
  });
  const [saving, setSaving] = useState(false);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await getSupabaseClient().functions.invoke<Status>(
      "lead_settings",
      { method: "POST", body },
    );
    if (error || !data) {
      const detail = await (error as any)?.context?.json?.().catch(() => null);
      throw new Error(detail?.message ?? error?.message ?? "Request failed");
    }
    return data;
  };

  useEffect(() => {
    call({ action: "status" })
      .then((s) => {
        setStatus(s);
        setPlain({
          phone_number_id: s.phone_number_id,
          template_name: s.template_name,
          template_language: s.template_language,
          template_has_name: s.template_has_name ? "yes" : "no",
        });
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      setStatus(await call({ action: "save", ...secrets, ...plain }));
      setSecrets({ access_token: "", app_secret: "" });
      notify("WhatsApp settings saved");
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const newKey = async () => {
    try {
      setStatus(await call({ action: "new_lead_key" }));
    } catch (e) {
      notify(`Could not create the key: ${(e as Error).message}`, {
        type: "error",
      });
    }
  };

  return (
    <Card id="leads">
      <CardContent className="space-y-4">
        <h2 className="text-xl font-semibold text-muted-foreground">
          WhatsApp & lead capture (Meta)
        </h2>
        <p className="text-sm text-muted-foreground">
          New leads get a WhatsApp welcome message, using the official Meta
          WhatsApp Cloud API. Saved secrets stay on the server and are never
          shown again; leave a field empty to keep what is saved.
        </p>

        <div className="grid grid-cols-1 gap-4">
          {SECRETS.map(({ key, label, help }) => {
            const saved = status?.[key];
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`wa-${key}`}>{label}</Label>
                <Input
                  id={`wa-${key}`}
                  type="password"
                  autoComplete="off"
                  value={secrets[key]}
                  onChange={(e) =>
                    setSecrets((v) => ({ ...v, [key]: e.target.value }))
                  }
                  placeholder={
                    saved?.set ? `Saved (ends with ${saved.hint})` : "Not set"
                  }
                />
                <p className="text-xs text-muted-foreground">{help}</p>
              </div>
            );
          })}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-phone">Phone number ID</Label>
            <Input
              id="wa-phone"
              dir="ltr"
              value={plain.phone_number_id}
              onChange={(e) =>
                setPlain((v) => ({ ...v, phone_number_id: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              From Meta: WhatsApp → API setup (not the phone number itself).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-template">Welcome template name</Label>
              <Input
                id="wa-template"
                dir="ltr"
                value={plain.template_name}
                onChange={(e) =>
                  setPlain((v) => ({ ...v, template_name: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-lang">Template language code</Label>
              <Input
                id="wa-lang"
                dir="ltr"
                value={plain.template_language}
                onChange={(e) =>
                  setPlain((v) => ({ ...v, template_language: e.target.value }))
                }
                placeholder="ar"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-var">Template has a name variable</Label>
              <select
                id="wa-var"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={plain.template_has_name}
                onChange={(e) =>
                  setPlain((v) => ({ ...v, template_has_name: e.target.value }))
                }
              >
                <option value="yes">Yes, {"{{1}}"} is the name</option>
                <option value="no">No variables</option>
              </select>
            </div>
          </div>
        </div>

        <Button
          type="button"
          onClick={save}
          disabled={
            saving ||
            (Object.values(secrets).every((v) => !v.trim()) &&
              !plain.phone_number_id.trim() &&
              !plain.template_name.trim())
          }
        >
          {saving ? "Saving…" : "Save WhatsApp settings"}
        </Button>

        {status && (
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-lg font-medium text-muted-foreground">
              Paste these in Meta (WhatsApp → Configuration → Webhook)
            </h3>
            <CopyRow label="Callback URL" value={status.webhook_url} />
            <CopyRow label="Verify token" value={status.verify_token} />
            <p className="text-xs text-muted-foreground">
              Subscribe the webhook to the <b>messages</b> field.
            </p>

            <h3 className="pt-2 text-lg font-medium text-muted-foreground">
              Lead capture
            </h3>
            <CopyRow
              label="Public request form"
              value={`${window.location.origin}${window.location.pathname}#/request-demo`}
            />
            <CopyRow
              label="API address (for Meta lead ads, Zapier, n8n)"
              value={status.lead_url}
            />
            {status.new_lead_key ? (
              <>
                <CopyRow
                  label="New API key (shown only now, send it as the x-api-key header)"
                  value={status.new_lead_key}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                API key:{" "}
                {status.lead_api_key.set
                  ? `saved (ends with ${status.lead_api_key.hint})`
                  : "not created yet"}
              </p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={newKey}>
              {status.lead_api_key.set
                ? "Replace the API key"
                : "Create an API key"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
