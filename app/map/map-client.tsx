"use client";

import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L, { Map as LeafletMap } from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UI } from "@/app/components/ui";

/* =========================
   Types
========================= */
type Parking = {
  id: string;
  title: string;

  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  price_hour: number | null;

  parking_type: "outdoor" | "indoor" | "garage" | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  photos: string[] | null;

  lat: number | null;
  lng: number | null;

  is_active: boolean | null;
};

type GeoPick = { lat: number; lng: number; displayName: string };
type NominatimItem = { display_name: string; lat: string; lon: string };

/* =========================
   Helpers
========================= */
function formatAddress(p: Parking) {
  const a1 = p.street
    ? `${p.street}${p.street_number ? " " + p.street_number : ""}`
    : "";
  const a2 =
    p.postal_code || p.city
      ? `${p.postal_code ?? ""} ${p.city ?? ""}`.trim()
      : "";
  return [a1, a2].filter(Boolean).join(", ");
}

// Haversine distance (meters)
function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lng - a.lng);

  const s =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) *
      Math.cos(φ2) *
      Math.sin(Δλ / 2) *
      Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function toPick(x: NominatimItem): GeoPick | null {
  const lat = Number(x.lat);
  const lng = Number(x.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng, displayName: x.display_name };
}

/* =========================
   Icons (slightly larger for mobile visibility)
========================= */
function carIcon() {
  const html = `
<div style="
  width:38px;
  height:38px;
  border-radius:999px;
  background:#111;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 3px 10px rgba(0,0,0,.28);
  border:2px solid #fff;
">
  <svg xmlns="http://www.w3.org/2000/svg"
    width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="white" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 13l2-5a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 5"/>
    <circle cx="7.5" cy="17.5" r="2.5"/>
    <circle cx="16.5" cy="17.5" r="2.5"/>
    <path d="M5 13h14"/>
  </svg>
</div>
`;
  return L.divIcon({
    className: "parkeo-car-marker",
    html,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -16],
  });
}

function userIcon() {
  const html = `
<div style="
  width:34px;
  height:34px;
  border-radius:999px;
  background:#7c3aed;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 3px 12px rgba(0,0,0,.25);
  border:2px solid #fff;
">
  <svg xmlns="http://www.w3.org/2000/svg"
    width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="white" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/>
    <circle cx="12" cy="10" r="2"/>
  </svg>
</div>
`;
  return L.divIcon({
    className: "parkeo-user-marker",
    html,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

/* =========================
   Map ref setter (reliable)
========================= */
function MapRefSetter({ onMap }: { onMap: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
}

/* =========================
   Component
========================= */
export default function MapClient() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Leaflet map ref (reliable via MapRefSetter)
  const mapRef = useRef<LeafletMap | null>(null);
  const handleMap = useCallback((m: LeafletMap) => {
    mapRef.current = m;
  }, []);

  // Popup control per marker
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  const [rows, setRows] = useState<Parking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // User position
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>("");

  // radius km (0 = all)
  const [radiusKm, setRadiusKm] = useState<number>(2);

  // Search (Nominatim)
  const [searchQ, setSearchQ] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchItems, setSearchItems] = useState<GeoPick[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Geneva center default
  const center: [number, number] = [46.2044, 6.1432];

  const visibleRows = useMemo(() => {
    if (!me) return rows;
    if (!radiusKm || radiusKm <= 0) return rows;

    const maxM = radiusKm * 1000;
    return rows.filter((p) => {
      if (typeof p.lat !== "number" || typeof p.lng !== "number") return false;
      return distanceMeters(me, { lat: p.lat, lng: p.lng }) <= maxM;
    });
  }, [rows, me, radiusKm]);

  const visibleRowsWithCoords = useMemo(
    () =>
      visibleRows.filter(
        (p) => typeof p.lat === "number" && typeof p.lng === "number"
      ),
    [visibleRows]
  );

  const load = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("parkings")
      .select(
        `
        id,
        title,
        street,
        street_number,
        postal_code,
        city,
        price_hour,
        parking_type,
        is_covered,
        has_ev_charger,
        is_secure,
        is_lit,
        photos,
        lat,
        lng,
        is_active
      `
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Parking[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Select helper: recentre + zoom + popup
  const focusParking = useCallback(
    (id: string) => {
      setSelectedId(id);

      const p = visibleRowsWithCoords.find((x) => x.id === id) ?? null;

      const mk = markerRefs.current[id];
      if (mk) mk.openPopup();

      const map = mapRef.current;
      if (!map || !p) return;

      requestAnimationFrame(() => {
        try {
          map.invalidateSize();
          map.setView([p.lat as number, p.lng as number], 15, { animate: true });
        } catch {
          // ignore
        }
      });
    },
    [visibleRowsWithCoords]
  );

  const goTo = useCallback((lat: number, lng: number, zoom = 15) => {
    const map = mapRef.current;
    if (!map) return;
    requestAnimationFrame(() => {
      try {
        map.invalidateSize();
        map.setView([lat, lng], zoom, { animate: true });
      } catch {
        // ignore
      }
    });
  }, []);

  // Nominatim search (debounced)
  const canSearch = useMemo(() => searchQ.trim().length >= 3, [searchQ]);

  const doSearch = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setSearchLoading(true);
    setSearchError(null);

    try {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(text)}`;

      const res = await fetch(url, { signal: abortRef.current.signal });
      const json = (await res.json().catch(() => [])) as NominatimItem[];

      if (!res.ok) {
        setSearchError(`Erreur recherche (${res.status})`);
        setSearchItems([]);
        setSearchOpen(false);
        setSearchLoading(false);
        return;
      }

      const mapped = (json ?? []).map(toPick).filter(Boolean) as GeoPick[];
      setSearchItems(mapped);
      setSearchOpen(true);
      setSearchLoading(false);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setSearchError(e instanceof Error ? e.message : "Erreur inconnue");
      setSearchItems([]);
      setSearchOpen(false);
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    setSearchError(null);

    if (!canSearch) {
      setSearchItems([]);
      setSearchOpen(false);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void doSearch(searchQ);
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [searchQ, canSearch, doSearch]);

  const locateMe = () => {
    setGeoStatus("");
    if (!("geolocation" in navigator)) {
      setGeoStatus("Géolocalisation non supportée.");
      return;
    }

    setGeoStatus("Demande d’autorisation GPS…");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMe({ lat, lng });
        setGeoStatus("Position détectée ✅");
        goTo(lat, lng, 14);
      },
      (err) => {
        setMe(null);
        if (err.code === 1) setGeoStatus("Autorisation refusée.");
        else if (err.code === 2) setGeoStatus("Position indisponible.");
        else setGeoStatus("Timeout GPS.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const clearMe = () => {
    setMe(null);
    setGeoStatus("");
    setRadiusKm(2);
    goTo(center[0], center[1], 12);
  };

  const btnPrimary = `${UI.btnBase} ${UI.btnPrimary}`;
  const btnGhost = `${UI.btnBase} ${UI.btnGhost}`;

  // ✅ Mobile map height: full screen minus navbar + action bar + spacing
  // NavbarClient is h-16 => 64px
  const mobileMapHeight = "calc(100dvh - 64px - 112px - 16px)";

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-4`}>
        {/* Desktop header hidden on mobile */}
        <header className="hidden lg:flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className={UI.h2}>Carte des parkings</h1>
            <p className={UI.p}>Recherche d’adresse + GPS + popup</p>
            {geoStatus ? <p className={UI.subtle}>{geoStatus}</p> : null}
          </div>

          <div className="flex gap-2">
            <Link href="/parkings" className={btnGhost}>
              Vue liste
            </Link>
          </div>
        </header>

        {/* ✅ ACTION BAR: sticky under navbar */}
        <section
          className={[
            UI.card,
            UI.cardPad,
            "sticky z-40",
            "top-[72px]", // under navbar (64px) + 8px
            "bg-white/85 backdrop-blur",
            "border border-slate-200/70",
            "space-y-3",
          ].join(" ")}
        >
          {/* Search */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className={UI.input}
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Adresse… (ex: Rue du Rhône 12, Genève)"
                  onFocus={() => {
                    if (searchItems.length > 0) setSearchOpen(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setSearchOpen(false), 120);
                  }}
                />
                {searchLoading ? (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    …
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setSearchQ("");
                  setSearchItems([]);
                  setSearchOpen(false);
                  setSearchError(null);
                }}
                title="Effacer"
              >
                Effacer
              </button>
            </div>

            {searchError ? (
              <p className="mt-2 text-sm text-rose-700">Erreur : {searchError}</p>
            ) : null}

            {searchOpen && searchItems.length > 0 ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {searchItems.map((it) => (
                  <button
                    key={`${it.lat}-${it.lng}-${it.displayName}`}
                    type="button"
                    className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      goTo(it.lat, it.lng, 15);
                      setSearchOpen(false);
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

            {!searchLoading && searchOpen && searchItems.length === 0 && canSearch ? (
              <p className="mt-2 text-sm text-slate-600">Aucun résultat.</p>
            ) : null}

            <div className="mt-2 text-xs text-slate-500">
              Astuce : tape au moins 3 caractères.
            </div>
          </div>

          {/* Actions row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={locateMe}
              title="Trouver les places autour de moi"
            >
              📍 Autour de moi
            </button>

            <button type="button" className={btnGhost} onClick={clearMe}>
              Réinitialiser
            </button>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">Rayon :</span>
              <select
                className={UI.select + " w-auto min-w-[120px]"}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                disabled={!me}
                title={!me ? "Active “Autour de moi” d’abord" : ""}
              >
                <option value={0}>Tout</option>
                <option value={1}>1 km</option>
                <option value={2}>2 km</option>
                <option value={5}>5 km</option>
                <option value={10}>10 km</option>
              </select>

              <span className={UI.subtle}>
                {me
                  ? `${visibleRowsWithCoords.length} place(s)`
                  : "Active le GPS"}
              </span>
            </div>

            <div className="flex-1" />

            <Link href="/parkings" className={btnGhost}>
              Vue liste
            </Link>

            <button className={btnGhost} onClick={load} disabled={loading}>
              {loading ? "…" : "Rafraîchir"}
            </button>

            {geoStatus ? (
              <span className={`${UI.subtle} text-xs`}>{geoStatus}</span>
            ) : null}
          </div>
        </section>

        {error && <p className="text-sm text-rose-700">Erreur : {error}</p>}

        {/* ✅ MOBILE: big map only */}
        <section className={`${UI.card} overflow-hidden lg:hidden`}>
          <div className="w-full" style={{ height: mobileMapHeight }}>
            <MapContainer
              center={center}
              zoom={12}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom
            >
              <MapRefSetter onMap={handleMap} />

              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Me */}
              {me ? (
                <>
                  <Marker position={[me.lat, me.lng]} icon={userIcon()}>
                    <Popup autoPan closeButton>
                      <div className="text-xs w-[180px] space-y-1">
                        <div className="font-semibold text-sm text-slate-900">
                          Vous
                        </div>
                        <div className="text-slate-600">Position actuelle</div>
                      </div>
                    </Popup>
                  </Marker>

                  {radiusKm > 0 ? (
                    <Circle
                      center={[me.lat, me.lng]}
                      radius={radiusKm * 1000}
                      pathOptions={{}}
                    />
                  ) : null}
                </>
              ) : null}

              {visibleRowsWithCoords.map((p) => (
                <Marker
                  key={p.id}
                  position={[p.lat as number, p.lng as number]}
                  icon={carIcon()}
                  ref={(r) => {
                    markerRefs.current[p.id] = r as unknown as L.Marker | null;
                  }}
                  eventHandlers={{
                    click: () => focusParking(p.id),
                  }}
                >
                  <Popup autoPan closeButton>
                    <div className="text-xs w-[220px] space-y-1">
                      <div className="font-semibold text-sm leading-tight text-slate-900">
                        {p.title}
                      </div>

                      <div className="text-slate-600 leading-snug">
                        {formatAddress(p) || "Adresse non renseignée"}
                      </div>

                      {p.price_hour !== null ? (
                        <div className="text-violet-700 font-semibold">
                          {p.price_hour} CHF / h
                        </div>
                      ) : null}

                      <div className="pt-2">
                        <Link
                          className={`${UI.btnBase} ${UI.btnPrimary} w-full justify-center`}
                          href={`/parkings/${p.id}`}
                        >
                          Voir détails
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </section>

        {/* ✅ DESKTOP: list left / map right */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-4" style={{ height: 620 }}>
          {/* LIST */}
          <section className={`${UI.card} ${UI.cardPad} overflow-auto`}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-sm text-slate-900">
                Places disponibles{" "}
                <span className={UI.subtle}>({visibleRows.length})</span>
              </div>

              <button className={btnGhost} onClick={load} disabled={loading}>
                {loading ? "…" : "Rafraîchir"}
              </button>
            </div>

            <div className="space-y-3">
              {visibleRows.map((p) => {
                const photo = p.photos?.[0] ?? null;
                const active = selectedId === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => focusParking(p.id)}
                    className={`w-full text-left ${UI.card} ${UI.cardHover} overflow-hidden ${
                      active ? "ring-2 ring-violet-400" : ""
                    }`}
                  >
                    <div className="flex">
                      <div className="w-28 h-20 bg-slate-100 shrink-0">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                            —
                          </div>
                        )}
                      </div>

                      <div className="p-4 flex-1">
                        <div className="flex justify-between gap-3">
                          <div className="font-medium text-slate-900">
                            {p.title}
                          </div>
                          {p.price_hour !== null && (
                            <div className="text-sm whitespace-nowrap font-semibold text-violet-700">
                              {p.price_hour} CHF/h
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 mt-1">
                          {formatAddress(p) || "Adresse non renseignée"}
                        </div>

                        <div className="mt-2">
                          <Link
                            href={`/parkings/${p.id}`}
                            className={UI.link + " text-xs"}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Voir la place →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}

              {!loading && visibleRows.length === 0 && (
                <p className="text-sm text-slate-600">
                  Aucune place trouvée pour ce rayon.
                </p>
              )}
            </div>
          </section>

          {/* MAP */}
          <section className={`${UI.card} overflow-hidden`}>
            <div className="w-full h-full">
              <MapContainer
                center={center}
                zoom={12}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom
              >
                <MapRefSetter onMap={handleMap} />

                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Me */}
                {me ? (
                  <>
                    <Marker position={[me.lat, me.lng]} icon={userIcon()}>
                      <Popup autoPan closeButton>
                        <div className="text-xs w-[180px] space-y-1">
                          <div className="font-semibold text-sm text-slate-900">
                            Vous
                          </div>
                          <div className="text-slate-600">Position actuelle</div>
                        </div>
                      </Popup>
                    </Marker>

                    {radiusKm > 0 ? (
                      <Circle
                        center={[me.lat, me.lng]}
                        radius={radiusKm * 1000}
                        pathOptions={{}}
                      />
                    ) : null}
                  </>
                ) : null}

                {visibleRowsWithCoords.map((p) => (
                  <Marker
                    key={p.id}
                    position={[p.lat as number, p.lng as number]}
                    icon={carIcon()}
                    ref={(r) => {
                      markerRefs.current[p.id] = r as unknown as L.Marker | null;
                    }}
                    eventHandlers={{
                      click: () => focusParking(p.id),
                    }}
                  >
                    <Popup autoPan closeButton>
                      <div className="text-xs w-[220px] space-y-1">
                        <div className="font-semibold text-sm leading-tight text-slate-900">
                          {p.title}
                        </div>

                        <div className="text-slate-600 leading-snug">
                          {formatAddress(p) || "Adresse non renseignée"}
                        </div>

                        {p.price_hour !== null ? (
                          <div className="text-violet-700 font-semibold">
                            {p.price_hour} CHF / h
                          </div>
                        ) : null}

                        <div className="pt-2">
                          <Link
                            className={`${UI.btnBase} ${UI.btnPrimary} w-full justify-center`}
                            href={`/parkings/${p.id}`}
                          >
                            Voir détails
                          </Link>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
