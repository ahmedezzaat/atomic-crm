import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";
import {
  useCreate,
  useGetIdentity,
  useGetList,
  useGetOne,
  useNotify,
  useUpdate,
} from "ra-core";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
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
import { Textarea } from "@/components/ui/textarea";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { QuotationPreview } from "./QuotationPreview";
import {
  CURRENCIES,
  computeTotals,
  formatMoney,
  quoteStatusLabel,
  periodLabel,
  periodPrice,
  periodPrices,
  type Period,
  type Product,
  type Quotation,
  type QuoteItem,
  type QuoteStatus,
} from "./quoteUtils";

type Draft = Omit<Quotation, "id" | "created_at" | "sales_id" | "total">;

const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const CUSTOM = "__custom";

export const QuotationForm = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { currency: defaultCurrency } = useConfigurationContext();
  const { data: identity } = useGetIdentity();
  const [create] = useCreate();
  const [update] = useUpdate();
  const [busy, setBusy] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  // Shrink the A4 page to fit the screen; printing always uses full size
  const previewBox = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = previewBox.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / 794));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [draft, setDraft] = useState<Draft>({
    number: "",
    company_id: Number(params.get("company_id")) || 0,
    contact_id: null,
    status: "draft",
    issue_date: plusDays(0),
    valid_until: plusDays(14),
    currency: CURRENCIES.includes(defaultCurrency) ? defaultCurrency : "EGP",
    language: "en",
    items: [{ description: "", quantity: 1, unit_price: 0 }],
    discount_type: "amount",
    discount_value: 0,
    discount_note: "",
    notes: "",
    terms: "",
  });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const { data: saved, refetch } = useGetOne<Quotation>(
    "quotations",
    { id: Number(id) },
    { enabled: !!id },
  );
  useEffect(() => {
    if (!saved) return;
    const { id: _i, created_at: _c, sales_id: _s, total: _t, ...rest } = saved;
    setDraft({ ...rest, items: saved.items?.length ? saved.items : [] });
  }, [saved]);

  const { data: products = [] } = useGetList<Product>("products", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "name", order: "ASC" },
    filter: { active: true },
  });
  const { data: company } = useGetOne<{ id: number; name: string }>(
    "companies",
    { id: draft.company_id },
    { enabled: !!draft.company_id },
  );
  const { data: found = [] } = useGetList<{ id: number; name: string }>(
    "companies",
    {
      pagination: { page: 1, perPage: 8 },
      sort: { field: "name", order: "ASC" },
      filter: { "name@ilike": `%${companySearch}%` },
    },
    { enabled: companySearch.trim().length > 1 },
  );
  const { data: contacts = [] } = useGetList<{
    id: number;
    first_name: string;
    last_name: string;
  }>(
    "contacts",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "first_name", order: "ASC" },
      filter: { company_id: draft.company_id },
    },
    { enabled: !!draft.company_id },
  );
  const contact = contacts.find((c) => c.id === draft.contact_id);
  const contactName = contact
    ? `${contact.first_name} ${contact.last_name}`.trim()
    : undefined;

  const setItem = (i: number, patch: Partial<QuoteItem>) =>
    set({
      items: draft.items.map((it, idx) =>
        idx === i ? { ...it, ...patch } : it,
      ),
    });

  const pickProduct = (i: number, value: string) => {
    if (value === CUSTOM) {
      setItem(i, {
        product_id: undefined,
        period: undefined,
        prices: undefined,
      });
      return;
    }
    const p = products.find((x) => String(x.id) === value);
    if (!p) return;
    const period = draft.items[i].period ?? "monthly";
    setItem(i, {
      product_id: p.id,
      prices: periodPrices(p),
      period,
      description: p.description ? `${p.name}\n${p.description}` : p.name,
      unit_price: periodPrice(p, period),
    });
  };

  const pickPeriod = (i: number, value: string) => {
    const period = value === CUSTOM ? undefined : (value as Period);
    const p = products.find((x) => x.id === draft.items[i].product_id);
    setItem(i, {
      period,
      ...(p && period ? { unit_price: periodPrice(p, period) } : {}),
    });
  };

  const { subtotal, discount, total } = computeTotals(
    draft.items,
    draft.discount_type,
    draft.discount_value,
  );

  const save = (status?: QuoteStatus) => {
    if (!draft.company_id)
      return notify("Choose the company first", { type: "warning" });
    const items = draft.items.filter((it) => it.description.trim());
    if (items.length === 0)
      return notify("Add at least one line with a description", {
        type: "warning",
      });
    setBusy(true);
    const data = {
      ...draft,
      ...(status ? { status } : {}),
      items,
      total: computeTotals(items, draft.discount_type, draft.discount_value)
        .total,
    };
    const done = {
      onError: (e: any) => {
        setBusy(false);
        notify(e?.message ?? "Could not save", { type: "error" });
      },
    };
    if (id) {
      update(
        "quotations",
        { id: Number(id), data, previousData: saved },
        {
          ...done,
          onSuccess: () => {
            setBusy(false);
            notify("Quotation saved");
            refetch();
          },
        },
      );
    } else {
      create(
        "quotations",
        { data: { ...data, sales_id: identity?.id } },
        {
          ...done,
          onSuccess: (rec: any) => {
            setBusy(false);
            notify("Quotation created");
            navigate(`/quotations/${rec.id}`, { replace: true });
          },
        },
      );
    }
  };

  // The browser uses the page title as the PDF file name
  useEffect(() => {
    const original = document.title;
    const before = () => {
      document.title = ["Kords Quotation", draft.number, company?.name]
        .filter(Boolean)
        .join(" - ");
    };
    const after = () => {
      document.title = original;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [draft.number, company?.name]);

  const field = "flex flex-col gap-1.5";
  return (
    <div className="mt-2 flex flex-col gap-4">
      <style>{`@page { size: A4; margin: 0; }
      @media print {
        body * { visibility: hidden !important; }
        .quote-print-area, .quote-print-area * { visibility: visible !important; }
        .quote-zoom { zoom: 1 !important; }
        .quote-print-area { position: absolute; top: 0; left: 0; width: 210mm !important; min-height: 296mm; margin: 0 !important; box-shadow: none !important; }
      }`}</style>
      <div className="flex items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Back"
            onClick={() => navigate("/quotations")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">
            {id ? `Quotation ${draft.number}` : "New quotation"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
          <Button size="sm" disabled={busy} onClick={() => save()}>
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 print:hidden">
          <Card>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className={`${field} md:col-span-2`}>
                <Label>Company</Label>
                {company ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{company.name}</span>
                    {!id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => set({ company_id: 0, contact_id: null })}
                      >
                        Change
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="Type 2+ letters of the company name"
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                    />
                    {found.length > 0 && (
                      <div className="rounded-md border">
                        {found.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              set({ company_id: c.id, contact_id: null });
                              setCompanySearch("");
                            }}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className={field}>
                <Label>Contact (optional)</Label>
                <Select
                  value={draft.contact_id ? String(draft.contact_id) : "none"}
                  onValueChange={(v) =>
                    set({ contact_id: v === "none" ? null : Number(v) })
                  }
                  disabled={!draft.company_id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No contact</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {`${c.first_name} ${c.last_name}`.trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={field}>
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => set({ status: v as QuoteStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(quoteStatusLabel) as QuoteStatus[]).map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {quoteStatusLabel[s]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className={field}>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={draft.issue_date}
                  onChange={(e) => set({ issue_date: e.target.value })}
                />
              </div>
              <div className={field}>
                <Label>Valid until</Label>
                <Input
                  type="date"
                  value={draft.valid_until ?? ""}
                  onChange={(e) => set({ valid_until: e.target.value || null })}
                />
              </div>
              <div className={field}>
                <Label>Currency</Label>
                <Select
                  value={draft.currency}
                  onValueChange={(v) => set({ currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={field}>
                <Label>Quotation language</Label>
                <Select
                  value={draft.language}
                  onValueChange={(v) => set({ language: v as "en" | "ar" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية (right-to-left)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <Label>Items</Label>
              {draft.items.map((it, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border p-3"
                >
                  <div className="grid gap-2 md:grid-cols-[1fr_150px]">
                    <Select
                      value={it.product_id ? String(it.product_id) : CUSTOM}
                      onValueChange={(v) => pickProduct(i, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick from products" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CUSTOM}>
                          Custom line / pick a product…
                        </SelectItem>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={it.period ?? CUSTOM}
                      onValueChange={(v) => pickPeriod(i, v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CUSTOM}>No period</SelectItem>
                        {(Object.keys(periodLabel) as Period[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {periodLabel[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="Description"
                    value={it.description}
                    onChange={(e) =>
                      setItem(i, { description: e.target.value })
                    }
                  />
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        Users
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={it.quantity}
                        onChange={(e) =>
                          setItem(i, { quantity: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="text-xs text-muted-foreground">
                        Unit price
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={it.unit_price}
                        onChange={(e) =>
                          setItem(i, { unit_price: Number(e.target.value) })
                        }
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove line"
                      onClick={() =>
                        set({
                          items: draft.items.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    set({
                      items: [
                        ...draft.items,
                        { description: "", quantity: 1, unit_price: 0 },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add line
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Label>Discount</Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-28"
                    value={draft.discount_value}
                    onChange={(e) =>
                      set({ discount_value: Number(e.target.value) })
                    }
                  />
                  <Select
                    value={draft.discount_type}
                    onValueChange={(v) =>
                      set({ discount_type: v as "amount" | "percent" })
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">{draft.currency}</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-right">
                  {discount > 0 ? (
                    <div className="text-sm text-muted-foreground">
                      {formatMoney(subtotal, draft.currency)} −{" "}
                      {formatMoney(discount, draft.currency)}
                    </div>
                  ) : null}
                  <div className="text-lg font-semibold">
                    {formatMoney(total, draft.currency)}
                  </div>
                </div>
              </div>
              <Input
                placeholder="Discount note (shown on the quotation), e.g. Launch offer"
                value={draft.discount_note}
                onChange={(e) => set({ discount_note: e.target.value })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className={field}>
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </div>
              <div className={field}>
                <Label>Terms & conditions</Label>
                <Textarea
                  rows={4}
                  placeholder="Payment terms, delivery, validity…"
                  value={draft.terms}
                  onChange={(e) => set({ terms: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div ref={previewBox} className="print:overflow-visible">
          <div className="quote-zoom" style={{ zoom }}>
            <QuotationPreview
              quote={{ ...draft, total }}
              companyName={company?.name ?? ""}
              contactName={contactName}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
