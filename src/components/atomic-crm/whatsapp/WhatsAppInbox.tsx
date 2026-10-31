import { Handshake, MessageCircle } from "lucide-react";
import { useCreate, useGetList, useGetMany, useNotify } from "ra-core";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";

type Message = {
  id: number;
  company_id: number | null;
  phone: string;
  direction: "in" | "out";
  body: string;
  status: string;
  error: string | null;
  created_at: string;
};

type Conversation = {
  phone: string;
  company_id: number | null;
  messages: Message[];
  last: Message;
  lastIn?: Message;
};

const SEEN_KEY = "wa-inbox-seen";
const readSeen = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
};
const WINDOW_MS = 24 * 3600_000;

const preview = (m: Message) =>
  `${m.direction === "out" ? "You: " : ""}${m.body}`;

/** All WhatsApp conversations in one place, newest first, with replies. */
export const WhatsAppInbox = () => {
  const notify = useNotify();
  const [create] = useCreate();
  const [selected, setSelected] = useState<string>();
  const [seen, setSeen] = useState<Record<string, string>>(readSeen);
  const [text, setText] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const { data: messages = [], refetch } = useGetList<Message>(
    "whatsapp_messages",
    {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "created_at", order: "DESC" },
    },
    { refetchInterval: 8000 },
  );

  const conversations = useMemo(() => {
    const byPhone = new Map<string, Conversation>();
    // messages arrive newest first
    for (const m of messages) {
      let c = byPhone.get(m.phone);
      if (!c) {
        c = { phone: m.phone, company_id: m.company_id, messages: [], last: m };
        byPhone.set(m.phone, c);
      }
      c.messages.unshift(m);
      if (m.company_id && !c.company_id) c.company_id = m.company_id;
      if (m.direction === "in" && !c.lastIn) c.lastIn = m;
    }
    // Only conversations the customer took part in; campaign-only sends are not inbox items
    return [...byPhone.values()].filter((c) => c.lastIn);
  }, [messages]);

  const companyIds = [
    ...new Set(conversations.map((c) => c.company_id).filter(Boolean)),
  ] as number[];
  const { data: companies = [] } = useGetMany(
    "companies",
    { ids: companyIds },
    { enabled: companyIds.length > 0 },
  );
  const nameOf = (c: Conversation) =>
    companies.find((co: any) => co.id === c.company_id)?.name ?? null;

  const isUnread = (c: Conversation) =>
    c.last.direction === "in" &&
    (!seen[c.phone] || new Date(c.last.created_at) > new Date(seen[c.phone]));

  const list = onlyUnread ? conversations.filter(isUnread) : conversations;
  const current = conversations.find((c) => c.phone === selected);
  const nbUnread = conversations.filter(isUnread).length;

  useEffect(() => {
    if (!current) return;
    const stamp = current.last.created_at;
    if (seen[current.phone] !== stamp) {
      const next = { ...seen, [current.phone]: stamp };
      setSeen(next);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: unread markers just reset on reload
      }
    }
  }, [current, seen]);

  const { data: openDeals = [], refetch: refetchDeals } = useGetList<{
    id: number;
  }>(
    "deals",
    {
      pagination: { page: 1, perPage: 1 },
      filter: { company_id: current?.company_id, "archived_at@is": null },
    },
    { enabled: !!current?.company_id },
  );

  const openDeal = async () => {
    if (!current?.company_id) return;
    setBusy(true);
    const { data, error } = await getSupabaseClient().functions.invoke<{
      deal_id: number;
    }>("whatsapp_send", {
      method: "POST",
      body: { action: "open_deal", company_id: current.company_id },
    });
    if (error || !data) {
      const detail = await (error as any)?.context?.json?.().catch(() => null);
      notify(detail?.message ?? error?.message ?? "Request failed", {
        type: "error",
      });
    } else {
      notify("Deal opened in the first stage, with a follow-up task.");
      refetchDeals();
    }
    setBusy(false);
  };

  const windowOpen = current?.lastIn
    ? Date.now() - new Date(current.lastIn.created_at).getTime() < WINDOW_MS
    : false;

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    const { error } = await getSupabaseClient().functions.invoke(
      "whatsapp_send",
      { method: "POST", body },
    );
    if (error) {
      const detail = await (error as any).context?.json?.().catch(() => null);
      notify(detail?.message ?? error.message, { type: "error" });
    } else {
      setText("");
      refetch();
    }
    setBusy(false);
  };

  const reply = () =>
    current &&
    send(
      current.company_id
        ? { company_id: current.company_id, text }
        : { phone: current.phone, text },
    );

  const addCompany = async () => {
    if (!current || !newName.trim()) return;
    setBusy(true);
    try {
      const company = await create(
        "companies",
        { data: { name: newName.trim(), phone_number: `+${current.phone}` } },
        { returnPromise: true },
      );
      // link the earlier messages so they show up in the company profile too
      const { error } = await getSupabaseClient().functions.invoke(
        "whatsapp_send",
        {
          method: "POST",
          body: {
            action: "link",
            company_id: company.id,
            phone: current.phone,
          },
        },
      );
      if (error) throw new Error(error.message);
      setNewName("");
      notify("Company added");
      refetch();
    } catch (e) {
      notify(`Could not add: ${(e as Error).message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">WhatsApp inbox</h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
          />
          Unread only ({nbUnread})
        </label>
      </div>

      <Card className="grid h-[calc(100vh-9rem)] grid-cols-1 overflow-hidden p-0 md:grid-cols-[22rem_1fr]">
        <div className="overflow-y-auto border-r">
          {list.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-8 w-8" />
              {conversations.length === 0
                ? "No replies yet. Messages from leads appear here."
                : "Nothing unread."}
            </div>
          )}
          {list.map((c) => (
            <button
              key={c.phone}
              type="button"
              onClick={() => setSelected(c.phone)}
              className={`flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left hover:bg-muted ${
                selected === c.phone ? "bg-muted" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate text-sm ${isUnread(c) ? "font-semibold" : "font-medium"}`}
                  dir="auto"
                >
                  {nameOf(c) ?? `+${c.phone}`}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(c.last.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-xs text-muted-foreground"
                  dir="auto"
                >
                  {preview(c.last)}
                </span>
                {isUnread(c) && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-col">
          {!current ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Choose a conversation
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="font-medium" dir="auto">
                    {nameOf(current) ?? "Not in the CRM yet"}
                  </div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    +{current.phone}
                  </div>
                </div>
                {current.company_id ? (
                  <div className="flex gap-2">
                    {openDeals.length > 0 ? (
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/deals/${openDeals[0].id}/show`}>
                          <Handshake className="h-4 w-4" />
                          Open deal
                        </Link>
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy} onClick={openDeal}>
                        <Handshake className="h-4 w-4" />
                        Interested → Open deal
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/companies/${current.company_id}/show`}>
                        Open company
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary">New number</Badge>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {current.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                      m.direction === "out"
                        ? "self-end bg-primary text-primary-foreground"
                        : "self-start bg-muted"
                    }`}
                  >
                    <p dir="auto" className="whitespace-pre-wrap">
                      {m.body}
                    </p>
                    <p className="mt-1 text-[11px] opacity-70">
                      {new Date(m.created_at).toLocaleString()}
                      {m.direction === "out" ? ` · ${m.status}` : ""}
                      {m.error ? ` · ${m.error}` : ""}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t p-3">
                {!current.company_id && (
                  <div className="flex gap-2">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Company name, to add this number to the CRM"
                    />
                    <Button
                      variant="outline"
                      disabled={busy || !newName.trim()}
                      onClick={addCompany}
                    >
                      Add company
                    </Button>
                  </div>
                )}
                {windowOpen ? (
                  <>
                    <Textarea
                      rows={2}
                      dir="auto"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Write a reply…"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={busy || !text.trim()}
                        onClick={reply}
                      >
                        Send
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Their last message was over 24 hours ago, so WhatsApp only
                    allows an approved template now.
                    {current.company_id
                      ? " Open the company to send the welcome template."
                      : ""}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

export default WhatsAppInbox;
