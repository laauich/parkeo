"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI } from "@/app/components/ui";

// Typage pour l'adresse brute retournée par Nominatim
type NominatimAddress = {
  road?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
};

type NominatimItem = {
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
};

export type PickPayload = {
  lat: number;
  lng: number;
  displayName: string;
  raw?: NominatimItem; // on garde le raw complet si besoin
};

type Props = {
  onPick: (p: PickPayload) => void;
  placeholder?: string;
  className?: string;
  query?: string;
  onQueryChange?: (v: string) => void;
};

function toPickPayload(x: NominatimItem): PickPayload | null {
  const lat = Number(x.lat);
  const lng = Number(x.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng, displayName: x.display_name, raw: x };
}

export default function AddressSearch({
  onPick,
  placeholder,
  className,
  query,
  onQueryChange,
}: Props) {
  const isControlled = typeof query === "string" && typeof onQueryChange === "function";

  const [internalQuery, setInternalQuery] = useState<string>("");
  const q = isControlled ? query : internalQuery;

  const setQ = (v: string) => {
    if (isControlled) onQueryChange?.(v);
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
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?format=json&addressdetails=1&limit=6&countrycodes=ch&q=${encodeURIComponent(text)}`;

      const res = await fetch(url, { signal: abortRef.current.signal });
      const json = (await res.json().catch(() => [])) as NominatimItem[];

      if (!res.ok) {
        setError(`Erreur recherche (${res.status})`);
        setItems([]);
        setLoading(false);
        return;
      }

      const mapped = (json ?? []).map(toPickPayload).filter(Boolean) as PickPayload[];

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
    if (!canSearch) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void search(q);
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [q, canSearch]);

  const showResults = open && items.length > 0;
  const showEmpty = open && !loading && items.length === 0 && canSearch;

  return (
    <div className={className ?? ""}>
      <div className="relative">
        <input
          className={UI.input}
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            if (v.trim().length < 3) setOpen(false);
          }}
          placeholder={placeholder ?? "Adresse en Suisse…"}
          onFocus={() => {
            if (items.length > 0) setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
        />

        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            …
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
          <p className="text-sm text-rose-700">
            <b>Erreur :</b> {error}
          </p>
        </div>
      )}

      {showResults && (
        <div className="mt-2 space-y-2">
          {items.map((it) => (
            <button
              key={`${it.lat}-${it.lng}-${it.displayName}`}
              type="button"
              className={`${UI.card} ${UI.cardHover} w-full text-left ${UI.cardPad}`}
              onMouseDown={(e) => e.preventDefault()} // évite blur avant click
              onClick={() => {
                onPick(it);
                setQ(it.displayName);
                setOpen(false);
              }}
            >
              <div className="font-medium text-slate-900">📍 {it.displayName}</div>
              <div className={UI.subtle}>{it.lat.toFixed(5)} · {it.lng.toFixed(5)}</div>
            </button>
          ))}
        </div>
      )}

      {showEmpty && <p className={[UI.p, "mt-2"].join(" ")}>Aucun résultat en Suisse.</p>}

      <p className={[UI.subtle, "mt-2"].join(" ")}>
        Astuce : tape au moins 3 caractères (ex : “Rue du Rhône 12, Genève”).
      </p>
    </div>
  );
}
