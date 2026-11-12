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
import { Textarea } from "@/components/ui/textarea";

import type { Product } from "./quoteUtils";

type PriceKey =
  | "price_monthly"
  | "price_quarterly"
  | "price_biannual"
  | "price_annual";
const PRICES: { key: PriceKey; label: string }[] = [
  { key: "price_monthly", label: "Monthly" },
  { key: "price_quarterly", label: "Quarterly" },
  { key: "price_biannual", label: "Bi-annual" },
  { key: "price_annual", label: "Annual" },
];

const GRID =
  "grid items-start gap-2 md:grid-cols-[1fr_1.4fr_100px_100px_100px_100px_auto]";

// Catalog of products / services with a price for each billing period
export const ProductList = () => {
  const navigate = useNavigate();
  const notify = useNotify();
  const { data: products = [], refetch } = useGetList<Product>("products", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "name", order: "ASC" },
  });
  const [create] = useCreate();
  const [update] = useUpdate();
  const [deleteOne] = useDelete();
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    price_monthly: "",
    price_quarterly: "",
    price_biannual: "",
    price_annual: "",
  });

  const add = () => {
    if (!draft.name.trim())
      return notify("Give the product a name", { type: "warning" });
    create(
      "products",
      {
        data: {
          name: draft.name.trim(),
          description: draft.description.trim(),
          price_monthly: Number(draft.price_monthly) || 0,
          price_quarterly: Number(draft.price_quarterly) || 0,
          price_biannual: Number(draft.price_biannual) || 0,
          price_annual: Number(draft.price_annual) || 0,
        },
      },
      {
        onSuccess: () => {
          setDraft({
            name: "",
            description: "",
            price_monthly: "",
            price_quarterly: "",
            price_biannual: "",
            price_annual: "",
          });
          refetch();
        },
        onError: (e: any) =>
          notify(e?.message ?? "Could not save", { type: "error" }),
      },
    );
  };

  const save = (p: Product, patch: Partial<Product>) =>
    update(
      "products",
      { id: p.id, data: patch, previousData: p },
      { onSuccess: () => refetch() },
    );

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
        <h1 className="text-2xl font-semibold">Products & services</h1>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            What you sell, with a price for each billing period. On a quotation
            you pick the product and the period, and the matching price fills in
            (you can still change it).
          </p>
          <div className={GRID}>
            <Input
              placeholder="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              placeholder="Description (optional)"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
            {PRICES.map(({ key, label }) => (
              <Input
                key={key}
                type="number"
                min={0}
                placeholder={label}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            ))}
            <Button onClick={add}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {products.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No products yet. You can also type custom lines directly in a
              quotation.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className={`${GRID} text-xs text-muted-foreground`}>
                <span>Name</span>
                <span>Description</span>
                {PRICES.map(({ key, label }) => (
                  <span key={key}>{label}</span>
                ))}
                <span />
              </div>
              {products.map((p) => (
                <div key={p.id} className={GRID}>
                  <Input
                    defaultValue={p.name}
                    onBlur={(e) =>
                      e.target.value !== p.name &&
                      save(p, { name: e.target.value })
                    }
                  />
                  <Textarea
                    rows={1}
                    defaultValue={p.description}
                    onBlur={(e) =>
                      e.target.value !== p.description &&
                      save(p, { description: e.target.value })
                    }
                  />
                  {PRICES.map(({ key }) => (
                    <Input
                      key={key}
                      type="number"
                      min={0}
                      defaultValue={p[key]}
                      onBlur={(e) =>
                        Number(e.target.value) !== Number(p[key]) &&
                        save(p, { [key]: Number(e.target.value) || 0 })
                      }
                    />
                  ))}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete product"
                    onClick={() => {
                      if (!confirm(`Delete ${p.name}?`)) return;
                      deleteOne(
                        "products",
                        { id: p.id },
                        { onSuccess: () => refetch() },
                      );
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
