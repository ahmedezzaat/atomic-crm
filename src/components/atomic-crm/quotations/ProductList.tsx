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

// Catalog of products / services with default prices
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
    unit_price: "",
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
          unit_price: Number(draft.unit_price) || 0,
        },
      },
      {
        onSuccess: () => {
          setDraft({ name: "", description: "", unit_price: "" });
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
            What you sell, with a default price. Pick them when making a
            quotation; you can still change the text and price on each one.
          </p>
          <div className="grid gap-2 md:grid-cols-[1fr_2fr_140px_auto]">
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
            <Input
              type="number"
              min={0}
              placeholder="Price"
              value={draft.unit_price}
              onChange={(e) =>
                setDraft({ ...draft, unit_price: e.target.value })
              }
            />
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
              {products.map((p) => (
                <div
                  key={p.id}
                  className="grid items-start gap-2 md:grid-cols-[1fr_2fr_140px_auto]"
                >
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
                  <Input
                    type="number"
                    min={0}
                    defaultValue={p.unit_price}
                    onBlur={(e) =>
                      Number(e.target.value) !== Number(p.unit_price) &&
                      save(p, { unit_price: Number(e.target.value) || 0 })
                    }
                  />
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
