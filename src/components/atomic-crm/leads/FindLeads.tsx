import { Search } from "lucide-react";
import { useNotify } from "ra-core";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { enrichCompanies } from "../companies/enrich";
import { getSupabaseClient } from "../providers/supabase/supabase";

type Place = {
  place_id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string;
  rating: number | null;
  reviews: number | null;
  maps_url: string;
  exists: boolean;
};

const SEGMENTS = [
  { label: "Real estate developers", query: "real estate developer" },
  { label: "Real estate brokers", query: "real estate agency" },
];

const AREAS: Record<string, string[]> = {
  "Cairo & New Cairo": [
    "New Cairo",
    "Fifth Settlement",
    "Mostakbal City",
    "Shorouk City",
    "Madinaty",
    "Rehab City",
    "Nasr City",
    "Heliopolis",
    "Maadi",
    "New Capital",
    "Downtown Cairo",
    "Zamalek",
    "Mokattam",
    "El Obour",
    "Badr City",
    "10th of Ramadan",
  ],
  Giza: [
    "6th of October",
    "Sheikh Zayed",
    "Mohandessin",
    "Dokki",
    "Haram",
    "Faisal",
    "Hadayek October",
    "Smart Village",
  ],
  "North Coast": [
    "North Coast",
    "Sidi Abdel Rahman",
    "Ras El Hekma",
    "El Alamein",
    "Marsa Matrouh",
  ],
  "Red Sea & Sinai": [
    "Ain Sokhna",
    "Hurghada",
    "El Gouna",
    "Sahl Hasheesh",
    "Marsa Alam",
    "Sharm El Sheikh",
    "Dahab",
    "Taba",
  ],
  "Alexandria & Delta": [
    "Alexandria",
    "Smouha",
    "Borg El Arab",
    "Tanta",
    "Mansoura",
    "Zagazig",
    "Damietta",
    "Port Said",
    "Ismailia",
    "Suez",
  ],
  "Upper Egypt": ["Fayoum", "Minya", "Asyut", "Sohag", "Luxor", "Aswan"],
};

const call = async <T,>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabaseClient().functions.invoke<T>(
    "lead_finder",
    { method: "POST", body },
  );
  if (error || !data) {
    const detail = await (error as any)?.context?.json?.().catch(() => null);
    throw new Error(detail?.message ?? error?.message ?? "Request failed");
  }
  return data;
};

export const FindLeads = () => {
  const notify = useNotify();
  const [configured, setConfigured] = useState<boolean>();
  const [newKey, setNewKey] = useState("");
  const [segment, setSegment] = useState(SEGMENTS[0]);
  const [area, setArea] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [enrich, setEnrich] = useState(true);
  const [previous, setPrevious] = useState<{
    created_at: string;
    results: number;
    imported: number;
  } | null>(null);
  const [searchId, setSearchId] = useState<number | null>(null);
  const [history, setHistory] = useState<
    {
      id: number;
      created_at: string;
      query: string;
      results: number;
      imported: number;
    }[]
  >([]);
  const loadHistory = () =>
    call<{ searches: typeof history }>({ action: "history" })
      .then((r) => setHistory(r.searches))
      .catch(() => undefined);

  useEffect(() => {
    call<{ configured: boolean }>({ action: "status" })
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
    loadHistory();
  }, []);

  const saveKey = async () => {
    try {
      await call({ action: "save_key", key: newKey });
      setConfigured(true);
      setNewKey("");
      notify("Google key saved");
    } catch (e) {
      notify(`Could not save: ${(e as Error).message}`, { type: "error" });
    }
  };

  const search = async (more = false) => {
    if (!area.trim()) {
      notify("Choose an area first", { type: "warning" });
      return;
    }
    setBusy(true);
    try {
      const res = await call<{
        places: Place[];
        next_page_token: string | null;
        previous?: typeof previous;
        search_id?: number | null;
      }>({
        action: "search",
        query: `${segment.query} in ${area.trim()}`,
        page_token: more ? nextToken : undefined,
      });
      setPlaces((p) => {
        const base = more ? p : [];
        const seen = new Set(base.map((x) => x.place_id));
        return [...base, ...res.places.filter((x) => !seen.has(x.place_id))];
      });
      if (!more) {
        setSelected(new Set());
        setPrevious(res.previous ?? null);
        setSearchId(res.search_id ?? null);
        loadHistory();
      }
      setNextToken(res.next_page_token);
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const importSelected = async () => {
    setBusy(true);
    try {
      const items = places.filter((p) => selected.has(p.place_id));
      const res = await call<{
        created: number;
        skipped: number;
        ids: number[];
      }>({
        action: "import",
        items,
        city: area.trim(),
        segment: segment.label,
        search_id: searchId,
      });
      notify(
        `${res.created} added to the CRM${res.skipped ? `, ${res.skipped} skipped (already there)` : ""}`,
      );
      if (enrich && res.ids.length > 0) {
        notify("Looking for emails and numbers on their websites…");
        let emails = 0;
        let phones = 0;
        try {
          for (let i = 0; i < res.ids.length; i += 25) {
            const r = await enrichCompanies(res.ids.slice(i, i + 25));
            emails += r.emails;
            phones += r.phones;
          }
          notify(`Found ${emails} email(s) and ${phones} extra number(s).`);
        } catch (e) {
          notify(
            `Companies were added, but enrichment failed: ${(e as Error).message}`,
            {
              type: "warning",
            },
          );
        }
      }
      const done = new Set(items.map((i) => i.place_id));
      setPlaces((p) =>
        p.map((x) => (done.has(x.place_id) ? { ...x, exists: true } : x)),
      );
      setSelected(new Set());
    } catch (e) {
      notify((e as Error).message, { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const selectable = places.filter((p) => !p.exists);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="mt-2 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Find leads on Google Maps</h1>

      {configured === false && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-medium">Google key needed</p>
            <p className="text-sm text-muted-foreground">
              Paste a Google Places API key (Google Cloud → APIs → Places API
              (New) → Credentials). Only administrators can save it. It is
              stored on the server and never shown again.
            </p>
            <div className="flex max-w-xl gap-2">
              <Input
                type="password"
                autoComplete="off"
                dir="ltr"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Google API key"
              />
              <Button onClick={saveKey} disabled={!newKey.trim()}>
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Who</Label>
            <div className="flex gap-2">
              {SEGMENTS.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  size="sm"
                  variant={segment.label === s.label ? "default" : "outline"}
                  onClick={() => setSegment(s)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fl-area">Area</Label>
            <select
              id="fl-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Choose an area</option>
              {Object.entries(AREAS).map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Button onClick={() => search()} disabled={busy || !configured}>
            <Search className="h-4 w-4" />
            Search
          </Button>
        </CardContent>
      </Card>

      {previous && (
        <Card>
          <CardContent className="text-sm">
            You already searched this on{" "}
            {new Date(previous.created_at).toLocaleDateString()}: it found{" "}
            {previous.results} results and you added {previous.imported}.
            Searching again costs another Google request.
          </CardContent>
        </Card>
      )}

      {places.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {places.length} results, {selected.size} selected. Imported
                companies are added without a deal; open one from the Inbox when
                they show interest.
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enrich}
                    onChange={(e) => setEnrich(e.target.checked)}
                  />
                  Also look for emails on their websites
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelected(
                      selected.size === selectable.length
                        ? new Set()
                        : new Set(selectable.map((p) => p.place_id)),
                    )
                  }
                >
                  Select all new
                </Button>
                <Button
                  size="sm"
                  onClick={importSelected}
                  disabled={busy || selected.size === 0}
                >
                  Add {selected.size || ""} to CRM
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {places.map((p) => (
                  <TableRow key={p.place_id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        disabled={p.exists}
                        checked={selected.has(p.place_id)}
                        onChange={() => toggle(p.place_id)}
                      />
                    </TableCell>
                    <TableCell>
                      <a
                        href={p.maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </a>
                      {p.exists && (
                        <Badge variant="secondary" className="ml-2">
                          In CRM
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell dir="ltr">{p.phone ?? "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {p.address}
                    </TableCell>
                    <TableCell>
                      {p.rating ? `${p.rating} (${p.reviews ?? 0})` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {nextToken && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => search(true)}
                disabled={busy}
              >
                Load more
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {history.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">Recent searches</p>
            <div className="text-sm text-muted-foreground">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex justify-between border-b py-1 last:border-0"
                >
                  <span>{h.query}</span>
                  <span>
                    {new Date(h.created_at).toLocaleDateString()} · {h.results}{" "}
                    found · {h.imported} added
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
