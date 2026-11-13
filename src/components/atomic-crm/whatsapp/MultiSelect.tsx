import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Option = { value: string; label: string };

/** Pick any number of options; nothing picked means "Any". */
export const MultiSelect = ({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
}) => {
  const [search, setSearch] = useState("");
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const labels = value.map(
    (v) => options.find((o) => o.value === v)?.label ?? v,
  );
  const shown = options.filter((o) =>
    o.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {labels.length === 0
              ? "Any"
              : labels.length <= 2
                ? labels.join(", ")
                : `${labels.length} selected`}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {options.length > 8 && (
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />
        )}
        <div className="max-h-64 overflow-y-auto">
          {shown.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">No options</p>
          )}
          {shown.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => onChange([])}
          >
            Clear (any)
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};
