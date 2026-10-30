import { useGetList, useNotify } from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Company } from "../types";

type WhatsAppMessage = {
  id: number;
  direction: "in" | "out";
  body: string;
  status: string;
  error: string | null;
  created_at: string;
};

/** The WhatsApp conversation with a company, and a box to reply. */
export const CompanyWhatsAppTab = ({ company }: { company: Company }) => {
  const notify = useNotify();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: messages = [], refetch } = useGetList<WhatsAppMessage>(
    "whatsapp_messages",
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: "created_at", order: "ASC" },
      filter: { company_id: company.id },
    },
    { refetchInterval: 10000 },
  );
  const optedOut = company.whatsapp_opted_out;

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    const { error } = await getSupabaseClient().functions.invoke(
      "whatsapp_send",
      { method: "POST", body: { company_id: company.id, ...body } },
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

  return (
    <div className="flex flex-col gap-3 pt-2">
      {optedOut && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          This company replied STOP, so it can't be messaged on WhatsApp.
        </p>
      )}
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
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
      {!optedOut && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={3}
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a reply…"
          />
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !company.phone_number}
              onClick={() => send({ template: true })}
            >
              Send the welcome template
            </Button>
            <Button
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() => send({ text })}
            >
              Send
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A free-text reply only reaches them within 24 hours of their last
            message. To start a conversation, send the welcome template.
          </p>
        </div>
      )}
    </div>
  );
};
