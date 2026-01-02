"use client";

import { useEffect, useRef, useState } from "react";

type Picked = {
  displayName: string;
  lat: number;
  lng: number;
};

type Props = {
  query: string;
  onQueryChange: (v: string) => void;
  onPick: (picked: Picked) => void;
  placeholder?: string;
};

type NominatimRow = {
  display_name: string;
  lat: string;
  lon: string;
};

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function isAbortError(e: unknown): boolean {
  // DOMException avec name === "AbortError"
  if (e instanceof DOMException && e.name === "AbortError") return true;

  // Certains environnements renvoient un Error classique
  if (e instanceof Error && e.name === "AbortError") return true;

  return false;
}

export default function AddressSearch({
  query,
  onQueryChange,
  onPick,
  placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const debounced = useDebounced(query, 450);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 4) {
      setRows([]);
      setErr(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=" +
          encodeURIComponent(q);

        const res = await fetch(url, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
        });

        if (!res.ok) throw new Error(`Erreur geocoding (${res.status})`);

        const data = (await res.json()) as NominatimRow[];

        const mapped: Picked[] = (data ?? []).map((r) => ({
          displayName: r.display_name,
          lat: Number(r.lat),
          lng: Number(r.lon),
        }));

        setRows(mapped.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng)));
        setOpen(true);
      } catch (e: unknown) {
        if (isAbortError(e)) return;
        setErr(e instanceof Error ? e.message : "Erreur geocoding");
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [debounced]);

  return (
    <div className="relative">
      <label className="text-sm font-medium">Recherche d’adresse (auto)</label>

      <input
        className="border rounded px-3 py-2 w-full mt-2"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Ex: Rue du Rhône 12, Genève"}
      />

      <div className="mt-2 text-xs text-gray-600">
        {loading ? "Recherche…" : err ? `Erreur : ${err}` : "Tape au moins 4 caractères."}
      </div>

      {open && rows.length > 0 ? (
        <div className="absolute z-20 mt-2 w-full border rounded bg-white shadow">
          {rows.map((r) => (
            <button
              key={`${r.lat}-${r.lng}-${r.displayName}`}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                onPick(r);
                setOpen(false);
              }}
            >
              {r.displayName}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
