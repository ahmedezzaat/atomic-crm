import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useUpdate,
} from "ra-core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { TermsTemplate } from "./quoteUtils";

// Ready-made terms & conditions. One per language can be the default, which
// fills in automatically when a new quotation is started.
export const TermsList = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const { data: templates = [], refetch } = useGetList<TermsTemplate>(
    "quotation_terms",
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: "name", order: "ASC" },
    },
  );
  const [create] = useCreate();
  const [update] = useUpdate();
  const [deleteOne] = useDelete();
  const [draft, setDraft] = useState({
    name: "",
    language: "en" as "en" | "ar",
    body: "",
  });

  const add = () => {
    if (!draft.name.trim() || !draft.body.trim())
      return notify("Give the template a name and its text", {
        type: "warning",
      });
    create(
      "quotation_terms",
      {
        data: {
          name: draft.name.trim(),
          language: draft.language,
          body: draft.body,
          is_default: !templates.some(
            (t) => t.language === draft.language && t.is_default,
          ),
        },
      },
      {
        onSuccess: () => {
          setDraft({ name: "", language: draft.language, body: "" });
          refetch();
        },
        onError: (e: any) =>
          notify(e?.message ?? "Could not save", { type: "error" }),
      },
    );
  };

  const save = (t: TermsTemplate, patch: Partial<TermsTemplate>) =>
    update(
      "quotation_terms",
      { id: t.id, data: patch, previousData: t },
      { onSuccess: () => refetch() },
    );

  const makeDefault = async (t: TermsTemplate) => {
    // only one default per language
    for (const other of templates) {
      if (
        other.language === t.language &&
        other.is_default &&
        other.id !== t.id
      ) {
        await update(
          "quotation_terms",
          { id: other.id, data: { is_default: false }, previousData: other },
          { returnPromise: true },
        );
      }
    }
    save(t, { is_default: true });
  };

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Back"
          onClick={() => navigate("/quotations")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">Terms & conditions templates</h1>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Write your terms once and reuse them. The default for each language
            is filled in when you start a new quotation; on any quotation you
            can pick another template or edit the text.
          </p>
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_180px]">
              <Input
                placeholder="Template name, e.g. Standard terms"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <Select
                value={draft.language}
                onValueChange={(v) =>
                  setDraft({ ...draft, language: v as "en" | "ar" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={5}
              dir={draft.language === "ar" ? "rtl" : "ltr"}
              placeholder="Payment terms, delivery, validity…"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <div className="flex justify-end">
              <Button onClick={add}>
                <Plus className="h-4 w-4" />
                Add template
              </Button>
            </div>
          </div>

          {templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No templates yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 rounded-md border p-3"
                >
                  <div className="grid items-center gap-2 md:grid-cols-[1fr_180px_auto_auto]">
                    <Input
                      defaultValue={t.name}
                      onBlur={(e) =>
                        e.target.value !== t.name &&
                        save(t, { name: e.target.value })
                      }
                    />
                    <Select
                      value={t.language}
                      onValueChange={(v) =>
                        save(t, {
                          language: v as "en" | "ar",
                          is_default: false,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ar">العربية</SelectItem>
                      </SelectContent>
                    </Select>
                    {t.is_default ? (
                      <span className="rounded bg-muted px-2 py-1 text-xs">
                        Default
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => makeDefault(t)}
                      >
                        Make default
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete template"
                      onClick={() => {
                        if (!confirm(`Delete ${t.name}?`)) return;
                        deleteOne(
                          "quotation_terms",
                          { id: t.id },
                          { onSuccess: () => refetch() },
                        );
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={5}
                    dir={t.language === "ar" ? "rtl" : "ltr"}
                    defaultValue={t.body}
                    onBlur={(e) =>
                      e.target.value !== t.body &&
                      save(t, { body: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
