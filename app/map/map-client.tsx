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

/* =========================
   Icons
========================= */
function carIcon() {
  const html = `
<div style="
  width:34px;
  height:34px;
  border-radius:999px;
  background:#111;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 3px 10px rgba(0,0,0,.28);
  border:2px solid #fff;
">
  <svg xmlns="http://www.w3.org/2000/svg"
    width="18" height="18" viewBox="0 0 24 24"
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
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

function userIcon() {
  const html = `
<div style="
  width:32px;
  height:32px;
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
    iconSize: [32, 32],
    iconAnchor: [16, 16],
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

  // ✅ Select helper: recentre + zoom + popup (works for LIST click too)
  const focusParking = useCallback(
    (id: string) => {
      setSelectedId(id);

      // find coords (only if marker exists)
      const p = visibleRowsWithCoords.find((x) => x.id === id) ?? null;

      // open popup first
      const mk = markerRefs.current[id];
      if (mk) mk.openPopup();

      // then recenter+zoom
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

        const map = mapRef.current;
        if (map) {
          requestAnimationFrame(() => {
            map.invalidateSize();
            map.setView([lat, lng], 14, { animate: true });
          });
        }
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

    const map = mapRef.current;
    if (map) {
      requestAnimationFrame(() => {
        map.invalidateSize();
        map.setView(center, 12, { animate: true });
      });
    }
  };

  // UI cosmetics
  const btnPrimary = `${UI.btnBase} ${UI.btnPrimary}`;
  const btnGhost = `${UI.btnBase} ${UI.btnGhost}`;

  return (
    <main className={UI.page}>
      {/* ✅ Full width wrapper (no max width here) */}
      <div className={`w-full ${UI.section} space-y-4`}>
        {/* ✅ Header + controls stay "nice" in container */}
        <div className={`${UI.container} space-y-4`}>
          <header className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className={UI.h2}>Carte des parkings</h1>
              <p className={UI.p}>1 clic = recentre + zoom + popup</p>
              {geoStatus ? <p className={UI.subtle}>{geoStatus}</p> : null}
            </div>

            <div className="flex gap-2">
              <Link href="/parkings" className={btnGhost}>
                Vue liste
              </Link>
            </div>
          </header>

          {/* Autour de moi */}
          <section
            className={`${UI.card} ${UI.cardPad} flex flex-wrap items-center gap-3`}
          >
            <button type="button" className={btnPrimary} onClick={locateMe}>
              📍 Autour de moi
            </button>

            <button type="button" className={btnGhost} onClick={clearMe}>
              Réinitialiser
            </button>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">Rayon :</span>
              <select
                className={UI.select + " w-auto min-w-[140px]"}
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
                  ? `${visibleRowsWithCoords.length} place(s) sur la carte`
                  : "Active le GPS pour filtrer"}
              </span>
            </div>
          </section>

          {error && <p className="text-sm text-rose-700">Erreur : {error}</p>}
        </div>

        {/* ✅ Map+List in full width */}
        <div className="w-full px-0">
          {/* We still keep a little padding so it doesn't stick to screen edges */}
          <div className="w-full px-4 sm:px-6 lg:px-8">
            {/* ✅ Responsive height: mobile uses viewport, desktop fixed */}
            <div className="grid lg:grid-cols-2 gap-4 h-[70vh] lg:h-[680px]">
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
                    {/* ✅ reliable ref */}
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
                              <div className="text-slate-600">
                                Position actuelle
                              </div>
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
                          markerRefs.current[p.id] =
                            r as unknown as L.Marker | null;
                        }}
                        eventHandlers={{
                          click: () => focusParking(p.id),
                        }}
                      >
                        <Popup autoPan closeButton>
                          <div className="text-xs w-[200px] space-y-1">
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

                            <div className="pt-1">
                              <Link className={UI.link} href={`/parkings/${p.id}`}>
                                Voir →
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
        </div>
      </div>
    </main>
  );
}
