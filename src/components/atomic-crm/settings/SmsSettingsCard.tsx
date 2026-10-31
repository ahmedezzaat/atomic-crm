import { useNotify } from "ra-core";
import { useEffect, useState } from "react";
import { ArrayInput } from "@/components/admin/array-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { secretFieldProps } from "../misc/secretField";

type Hint = { set: boolean; hint: string };
type Status = { token: Hint; api_key: Hint; username: Hint };

const FIELDS = [
  {
    key: "token",
    label: "API token",
    help: "The access token from your Cequens account.",
  },
  {
    key: "api_key",
    label: "API key",
    help: "Your Cequens API key.",
  },
  {
    key: "username",
    label: "Username (optional)",
    help: "Only needed if you don't use an API token: the app then signs in with the username and API key.",
  },
] as const;

/**
 * SMS provider credentials. Values are sent to the server and never read back:
 * the card only shows whether each one is saved and its last 4 characters.
 */
export const SmsSettingsCard = () => {
  const notify = useNotify();
  const [status, setStatus] = useState<Status>();
  const [values, setValues] = useState({
    token: "",
    api_key: "",
    username: "",
  });
  const [saving, setSaving] = useState(false);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await getSupabaseClient().functions.invoke<Status>(
      "sms_settings",
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
      .then(setStatus)
      .catch(() => undefined);
    // loaded once when the settings page opens
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      setStatus(await call({ action: "save", ...values }));
      setValues({ token: "", api_key: "", username: "" });
      notify("SMS credentials saved");
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card id="sms">
      <CardContent className="space-y-4">
        <h2 className="text-xl font-semibold text-muted-foreground">
          SMS provider (Cequens)
        </h2>
        <p className="text-sm text-muted-foreground">
          Used by SMS campaigns. Saved values stay on the server and are never
          shown again; leave a field empty to keep what is saved.
        </p>
        <h3 className="text-lg font-medium text-muted-foreground">
          Sender names
        </h3>
        <p className="text-xs text-muted-foreground">
          Only add names that are approved on your Cequens account, spelled
          exactly as there. Campaigns pick their sender from this list.
        </p>
        <ArrayInput source="smsSenders" label={false} helperText={false}>
          <SimpleFormIterator disableReordering disableClear>
            <TextInput source="label" label={false} />
          </SimpleFormIterator>
        </ArrayInput>
        <h3 className="text-lg font-medium text-muted-foreground">
          API credentials
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {FIELDS.map(({ key, label, help }) => {
            const saved = status?.[key];
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`sms-${key}`}>{label}</Label>
                <Input
                  id={`sms-${key}`}
                  {...secretFieldProps}
                  value={values[key]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [key]: e.target.value }))
                  }
                  placeholder={
                    saved?.set ? `Saved (ends with ${saved.hint})` : "Not set"
                  }
                />
                <p className="text-xs text-muted-foreground">{help}</p>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          onClick={save}
          disabled={saving || Object.values(values).every((v) => !v.trim())}
        >
          {saving ? "Saving…" : "Save SMS credentials"}
        </Button>
      </CardContent>
    </Card>
  );
};
