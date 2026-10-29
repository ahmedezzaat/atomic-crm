import { useNotify } from "ra-core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getSupabaseClient } from "../providers/supabase/supabase";

type Hint = { set: boolean; hint: string };
type Status = { app_id: Hint; app_certificate: Hint };

const FIELDS = [
  {
    key: "app_id",
    label: "Agora App ID",
    help: "From your project in the Agora console.",
  },
  {
    key: "app_certificate",
    label: "Agora App Certificate",
    help: "Enable the primary certificate on the project in the Agora console, then copy it here.",
  },
] as const;

/**
 * Agora credentials for voice and video calls. Values are sent to the server
 * and never read back: only whether each is saved and its last 4 characters.
 */
export const CallSettingsCard = () => {
  const notify = useNotify();
  const [status, setStatus] = useState<Status>();
  const [values, setValues] = useState({ app_id: "", app_certificate: "" });
  const [saving, setSaving] = useState(false);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await getSupabaseClient().functions.invoke<Status>(
      "call_settings",
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
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      setStatus(await call({ action: "save", ...values }));
      setValues({ app_id: "", app_certificate: "" });
      notify("Call credentials saved");
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card id="calls">
      <CardContent className="space-y-4">
        <h2 className="text-xl font-semibold text-muted-foreground">
          Voice & video calls (Agora)
        </h2>
        <p className="text-sm text-muted-foreground">
          Used for calls started from a company. Saved values stay on the server
          and are never shown again; leave a field empty to keep what is saved.
        </p>
        <div className="grid grid-cols-1 gap-4">
          {FIELDS.map(({ key, label, help }) => {
            const saved = status?.[key];
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`call-${key}`}>{label}</Label>
                <Input
                  id={`call-${key}`}
                  type="password"
                  autoComplete="off"
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
          {saving ? "Saving…" : "Save call credentials"}
        </Button>
      </CardContent>
    </Card>
  );
};
