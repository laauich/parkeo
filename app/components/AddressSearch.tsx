"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI } from "@/app/components/ui";

export type PickPayload = {
  lat: number;
  lng: number;
  displayName: string;
};

type NominatimItem = {
  display_name: string;
  lat: string;
  lon: string;
};

type Props = {
  onPick: (p: PickPayload) => void;
  placeholder?: string;
  className?: string;

  /**
   * ✅ Optionnel (nouvelle API)
   * Si fourni, AddressSearch devient "controlled".
   */
  query?: string;
  onQueryChange?: (v: string) => void;
};

function toPickPayload(x: NominatimItem): PickPayload | null {
  const lat = Number(x.lat);
  const lng = Number(x.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng, displayName: x.display_name };
}

export default function AddressSearch({
  onPick,
  placeholder,
  className,
  query,
  onQueryChange,
}: Props) {
  // ✅ support controlled/uncontrolled
  const isControlled = typeof query === "string" && typeof onQueryChange === "function";

  const [internalQuery, setInternalQuery] = useState<string>("");
  const q = isControlled ? (query as string) : internalQuery;

  const setQ = (v: string) => {
    if (isControlled) (onQueryChange as (v: string) => void)(v);
    else setInternalQuery(v);
  };

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PickPayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const canSearch = useMemo(() => q.trim().length >= 3, [q]);

  const search = async (text: string) => {
    if (!text.trim()) return;

    setLoading(true);
    setError(null);

    try {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      // Nominatim (OpenStreetMap) — gratuit
      // Tip: on restreint à la Suisse / Genève peut être trop strict, donc on reste souple.
      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(text)}`;

      const res = await fetch(url, {
        signal: abortRef.current.signal,
        headers: {
          // Nominatim recommande un User-Agent clair ; côté browser on ne peut pas toujours le fixer,
          // donc on reste simple. (Ça marche généralement en dev/prod.)
        },
      });

      const json = (await res.json().catch(() => [])) as NominatimItem[];

      if (!res.ok) {
        setError(`Erreur recherche (${res.status})`);
        setItems([]);
        setLoading(false);
        return;
      }

      const mapped = (json ?? [])
        .map(toPickPayload)
        .filter(Boolean) as PickPayload[];

      setItems(mapped);
      setOpen(true);
      setLoading(false);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setItems([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    setError(null);

    if (!canSearch) {
      setItems([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void search(q);
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, canSearch]);

  return (
    <div className={className ?? ""}>
      <div className="relative">
        <input
          className={UI.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? "Adresse…"}
          onFocus={() => {
            if (items.length > 0) setOpen(true);
          }}
          onBlur={() => {
            // petit délai pour laisser le click sur une suggestion
            window.setTimeout(() => setOpen(false), 120);
          }}
        />

        {loading ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            …
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-rose-700">Erreur : {error}</p> : null}

      {open && items.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {items.map((it) => (
            <button
              key={`${it.lat}-${it.lng}-${it.displayName}`}
              type="button"
              className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()} // évite blur avant click
              onClick={() => {
                onPick(it);
                setOpen(false);
              }}
            >
              <div className="font-medium text-slate-900">📍 {it.displayName}</div>
              <div className="text-xs text-slate-500">
                {it.lat.toFixed(5)} · {it.lng.toFixed(5)}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {!loading && open && items.length === 0 && canSearch ? (
        <p className="mt-2 text-sm text-slate-600">Aucun résultat.</p>
      ) : null}

      <p className="mt-2 text-xs text-slate-500">
        Astuce : tape au moins 3 caractères (ex: “Rue du Rhône 12, Genève”).
      </p>
    </div>
  );
}
