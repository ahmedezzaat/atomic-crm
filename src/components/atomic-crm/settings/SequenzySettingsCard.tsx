import { useNotify } from "ra-core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { secretFieldProps } from "../misc/secretField";

type Status = {
  key_set: boolean;
  key_hint: string;
  list_id: string;
  enabled: boolean;
  pending: number;
  queued?: number;
};
type SeqList = { id: string; name: string };

/**
 * Connects Sequenzy: every email added to a company or contact is sent to the
 * chosen list. The API key is sent to the server and never read back.
 */
export const SequenzySettingsCard = () => {
  const notify = useNotify();
  const [status, setStatus] = useState<Status>();
  const [apiKey, setApiKey] = useState("");
  const [lists, setLists] = useState<SeqList[]>([]);
  const [listId, setListId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState("");

  const call = async <T,>(body: Record<string, unknown>) => {
    const { data, error } = await getSupabaseClient().functions.invoke<T>(
      "sequenzy_settings",
      { method: "POST", body },
    );
    if (error || !data) {
      const detail = await (error as any)?.context?.json?.().catch(() => null);
      throw new Error(detail?.message ?? error?.message ?? "Request failed");
    }
    return data;
  };

  const apply = (s: Status) => {
    setStatus(s);
    setListId(s.list_id);
    setEnabled(s.enabled);
  };

  useEffect(() => {
    call<Status>({ action: "status" })
      .then(apply)
      .catch(() => undefined);
    // loaded once when the settings page opens
  }, []);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    } finally {
      setBusy("");
    }
  };

  const saveKey = () =>
    run("key", async () => {
      apply(await call<Status>({ action: "save", api_key: apiKey }));
      setApiKey("");
      const res = await call<{ lists: SeqList[] }>({ action: "lists" });
      setLists(res.lists);
      notify(`Key saved. Found ${res.lists.length} list(s).`);
    });

  const loadLists = () =>
    run("lists", async () => {
      const res = await call<{ lists: SeqList[] }>({ action: "lists" });
      setLists(res.lists);
    });

  const saveSettings = () =>
    run("save", async () => {
      apply(await call<Status>({ action: "save", list_id: listId, enabled }));
      notify("Sequenzy settings saved");
    });

  const syncExisting = () =>
    run("backfill", async () => {
      const res = await call<Status>({ action: "backfill" });
      setStatus(res);
      notify(
        `${res.queued ?? 0} email(s) queued. They are sent in the background.`,
      );
    });

  const listChoices =
    listId && !lists.some((l) => l.id === listId)
      ? [{ id: listId, name: listId }, ...lists]
      : lists;

  return (
    <Card id="sequenzy">
      <CardContent className="space-y-4">
        <h2 className="text-xl font-semibold text-muted-foreground">
          Sequenzy email list
        </h2>
        <p className="text-sm text-muted-foreground">
          Every email added to a company or a contact is sent to a Sequenzy list
          automatically. People who unsubscribed in Sequenzy are never added
          back, and no automations are started by the sync.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sequenzy-key">API key</Label>
          <div className="flex gap-2">
            <Input
              id="sequenzy-key"
              {...secretFieldProps}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                status?.key_set
                  ? `Saved (ends with ${status.key_hint})`
                  : "Not set"
              }
            />
            <Button
              type="button"
              variant="outline"
              disabled={!apiKey.trim() || busy !== ""}
              onClick={saveKey}
            >
              Save key
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            In Sequenzy: Settings → API Keys. It needs permission to write
            subscribers and read lists.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>List</Label>
          <div className="flex gap-2">
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a list" />
              </SelectTrigger>
              <SelectContent>
                {listChoices.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={!status?.key_set || busy !== ""}
              onClick={loadLists}
            >
              Load my lists
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Send new emails to this list automatically
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy !== "" || !status?.key_set || !listId}
            onClick={saveSettings}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              busy !== "" ||
              !status?.key_set ||
              !status?.list_id ||
              !status?.enabled
            }
            onClick={syncExisting}
          >
            Send existing emails now
          </Button>
          {status && status.pending > 0 && (
            <span className="text-sm text-muted-foreground">
              {status.pending} waiting to be sent
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          "Send existing emails now" adds every email already in the CRM
          (companies and contacts). Run it once after turning the sync on.
        </p>
      </CardContent>
    </Card>
  );
};
