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
  connect_error?: string;
  app_id: string;
  config_id: string;
  waba_id: string;
  display_phone?: string;
  mode: "cloud" | "coexistence";
};

type Method = "cloud" | "coexistence";

// Meta's JavaScript SDK is only loaded when someone connects a number
declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const loadFacebookSdk = (appId: string) =>
  new Promise<void>((resolve, reject) => {
    const init = () => {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: "v21.0",
      });
      resolve();
    };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onerror = () => reject(new Error("Could not load Meta's sign-in"));
    document.body.appendChild(script);
  });

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
  const [method, setMethod] = useState<Method>("cloud");
  const [ids, setIds] = useState({ app_id: "", config_id: "" });
  const [connecting, setConnecting] = useState(false);

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
        setMethod(s.mode);
        setIds({ app_id: s.app_id, config_id: s.config_id });
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

  // Coexistence: the number stays in the WhatsApp Business app and also works here.
  // Meta's sign-up window returns a one-time code plus the account and number ids.
  const connectCoexistence = async () => {
    setConnecting(true);
    try {
      const saved = await call({
        action: "save",
        ...secrets,
        app_id: ids.app_id,
        config_id: ids.config_id,
      });
      setStatus(saved);
      setSecrets({ access_token: "", app_secret: "" });
      if (
        !ids.app_id.trim() ||
        !ids.config_id.trim() ||
        !saved.app_secret.set
      ) {
        throw new Error(
          "Enter the Meta App ID, the Configuration ID and the App secret first",
        );
      }
      await loadFacebookSdk(ids.app_id.trim());

      let session: { phone_number_id?: string; waba_id?: string } | undefined;
      let cancelled = false;
      // what Meta reports, shown if the connection does not finish
      const seen: string[] = [];
      const onMessage = (event: MessageEvent) => {
        let origin = "";
        try {
          origin = new URL(event.origin).hostname;
        } catch {
          return;
        }
        if (!/(^|\.)facebook\.com$/.test(origin)) return;
        try {
          const data =
            typeof event.data === "string"
              ? JSON.parse(event.data)
              : event.data;
          if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
          seen.push(String(data.event));
          if (data.event === "CANCEL") {
            cancelled = true;
            const where = data.data?.current_step ?? data.data?.error_message;
            if (where) seen.push(`stopped at: ${where}`);
          } else if (String(data.event).startsWith("FINISH")) {
            session = data.data;
          }
        } catch {
          // not a message about the sign-up
        }
      };
      window.addEventListener("message", onMessage);
      try {
        let loginStatus = "no response";
        const code = await new Promise<string | undefined>((resolve) => {
          window.FB.login(
            (response: any) => {
              loginStatus = String(response?.status ?? "no status");
              resolve(response?.authResponse?.code);
            },
            {
              config_id: ids.config_id.trim(),
              response_type: "code",
              override_default_response_type: true,
              extras: {
                setup: {},
                featureType: "whatsapp_business_app_onboarding",
                sessionInfoVersion: "3",
              },
            },
          );
        });
        // the account details can arrive just after the sign-in window closes
        for (let i = 0; i < 8 && !session && !cancelled; i++) {
          await new Promise((r) => setTimeout(r, 250));
        }
        // already-connected numbers skip the details message: the server finds them
        if (!code || cancelled) {
          throw new Error(
            `Meta did not finish the connection. Login: ${loginStatus}; code received: ${code ? "yes" : "no"}; Meta events: ${seen.join(", ") || "none"}. Send this line to support.`,
          );
        }
        const result = await call({
          action: "connect_coexistence",
          code,
          // some Meta setups want the sign-in page's own address back
          redirect_uri: `${window.location.origin}${window.location.pathname}`,
          origin: window.location.origin,
          waba_id: session?.waba_id,
          phone_number_id: session?.phone_number_id,
        });
        setStatus(result);
        setPlain((v) => ({
          ...v,
          phone_number_id: result.phone_number_id,
        }));
        if (result.connect_error) {
          notify(result.connect_error, { type: "warning" });
        } else {
          notify("WhatsApp number connected");
        }
      } finally {
        window.removeEventListener("message", onMessage);
      }
    } catch (e) {
      notify(`Could not connect: ${(e as Error).message}`, { type: "error" });
    } finally {
      setConnecting(false);
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

        <div className="flex flex-col gap-2">
          <Label>How is your WhatsApp number connected?</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={method === "cloud" ? "default" : "outline"}
              onClick={() => setMethod("cloud")}
            >
              WhatsApp Cloud API (number used only here)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={method === "coexistence" ? "default" : "outline"}
              onClick={() => setMethod("coexistence")}
            >
              Coexistence (number also stays in the WhatsApp Business app)
            </Button>
          </div>
          {status?.phone_number_id && (
            <p className="text-xs text-muted-foreground">
              Currently connected using{" "}
              <b>
                {status.mode === "coexistence"
                  ? "coexistence"
                  : "the Cloud API"}
              </b>
              .
            </p>
          )}
        </div>

        {method === "coexistence" && (
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm text-muted-foreground">
              Keep using the number in the WhatsApp Business app on your phone
              and let the CRM send and receive on it too. Messages you type on
              the phone also appear in the Inbox. The number must already be
              active in the <b>WhatsApp Business app</b> (not personal
              WhatsApp).
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wa-app-id">Meta App ID</Label>
                <Input
                  id="wa-app-id"
                  dir="ltr"
                  value={ids.app_id}
                  onChange={(e) =>
                    setIds((v) => ({ ...v, app_id: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  App settings → Basic.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wa-config-id">
                  Embedded Signup configuration ID
                </Label>
                <Input
                  id="wa-config-id"
                  dir="ltr"
                  value={ids.config_id}
                  onChange={(e) =>
                    setIds((v) => ({ ...v, config_id: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Facebook Login for Business → Configurations.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-coex-secret">App secret</Label>
              <Input
                id="wa-coex-secret"
                type="password"
                autoComplete="off"
                value={secrets.app_secret}
                onChange={(e) =>
                  setSecrets((v) => ({ ...v, app_secret: e.target.value }))
                }
                placeholder={
                  status?.app_secret.set
                    ? `Saved (ends with ${status.app_secret.hint})`
                    : "Not set"
                }
              />
              <p className="text-xs text-muted-foreground">
                App settings → Basic → Show. Used to finish the connection and
                to check that replies really come from Meta.
              </p>
            </div>
            <Button
              type="button"
              onClick={connectCoexistence}
              disabled={connecting}
            >
              {connecting
                ? "Waiting for Meta…"
                : status?.mode === "coexistence" && status.waba_id
                  ? "Connect again"
                  : "Connect my WhatsApp Business app number"}
            </Button>
            {status?.mode === "coexistence" && status.waba_id && (
              <p className="text-sm">
                Connected. WhatsApp account:{" "}
                <span dir="ltr">{status.waba_id}</span>
              </p>
            )}
            {status?.connect_error && (
              <p className="text-sm text-destructive">{status.connect_error}</p>
            )}
          </div>
        )}

        <div
          className={method === "cloud" ? "grid grid-cols-1 gap-4" : "hidden"}
        >
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
        </div>

        <div className="grid grid-cols-1 gap-4">
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
              {method === "coexistence" && (
                <>
                  {" "}
                  For coexistence also subscribe to <b>
                    smb_message_echoes
                  </b>, <b>history</b> and <b>smb_app_state_sync</b>. Messages
                  you type on the phone then show up in the Inbox.
                </>
              )}
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
