"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L, { Map as LeafletMap } from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  width:36px;
  height:36px;
  border-radius:50%;
  background:#111;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 2px 6px rgba(0,0,0,.3);
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
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function userIcon() {
  const html = `
<div style="
  width:34px;
  height:34px;
  border-radius:50%;
  background:#2563eb;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 2px 8px rgba(0,0,0,.25);
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
   Component
========================= */
export default function MapClient() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  // ✅ on garde l'instance Leaflet ici
  const mapRef = useRef<LeafletMap | null>(null);

  // ✅ function-ref compatible avec react-leaflet (à la place de whenCreated)
  const setMapRef = (m: LeafletMap | null) => {
    mapRef.current = m;
  };

  const [rows, setRows] = useState<Parking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Position utilisateur
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>("");

  // Rayon filtre (km) : 0 = tout
  const [radiusKm, setRadiusKm] = useState<number>(2);

  // Centre Genève par défaut
  const center: [number, number] = [46.2044, 6.1432];

  // Filtrage "autour de moi" si me != null et radiusKm > 0
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

  const selected = useMemo(
    () => visibleRowsWithCoords.find((p) => p.id === selectedId) ?? null,
    [visibleRowsWithCoords, selectedId]
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

  // ✅ FIX ESLint: ne pas appeler load() "synchronously" dans l'effet
  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centre la carte sur la place sélectionnée
  useEffect(() => {
    if (!selected || !mapRef.current) return;
    mapRef.current.setView(
      [selected.lat as number, selected.lng as number],
      Math.max(mapRef.current.getZoom(), 14),
      { animate: true }
    );
  }, [selected]);

  const locateMe = () => {
    setGeoStatus("");
    if (!("geolocation" in navigator)) {
      setGeoStatus("Géolocalisation non supportée sur ce navigateur.");
      return;
    }

    setGeoStatus("Demande d’autorisation GPS…");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMe({ lat, lng });
        setGeoStatus("Position détectée ✅");

        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 14, { animate: true });
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
    if (mapRef.current) mapRef.current.setView(center, 12, { animate: true });
  };

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Carte des parkings</h1>
          <p className="text-sm text-gray-600">
            Cliquez sur une place pour la localiser sur la carte
          </p>
          {geoStatus ? (
            <p className="text-xs text-gray-500 mt-1">{geoStatus}</p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Link href="/parkings" className={UI.btnGhost}>
            Vue liste
          </Link>
          <Link href="/parkings/new" className={UI.btnPrimary}>
            Proposer ma place
          </Link>
        </div>
      </header>

      {/* Barre "Autour de moi" */}
      <section className="border rounded p-4 flex flex-wrap items-center gap-3">
        <button type="button" className={UI.btnPrimary} onClick={locateMe}>
          📍 Autour de moi
        </button>

        <button type="button" className={UI.btnGhost} onClick={clearMe}>
          Réinitialiser
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Rayon :</span>
          <select
            className="border rounded px-3 py-2 text-sm"
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

          <span className="text-xs text-gray-500">
            {me
              ? `${visibleRowsWithCoords.length} place(s) sur la carte`
              : "Active le GPS pour filtrer"}
          </span>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

      <div className="grid lg:grid-cols-2 gap-4" style={{ minHeight: 520 }}>
        {/* ===== LISTE ===== */}
        <section className="border rounded p-4 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium text-sm">
              Places disponibles{" "}
              <span className="text-xs text-gray-500">({visibleRows.length})</span>
            </div>

            <button className={UI.btnGhost} onClick={load} disabled={loading}>
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
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left border rounded overflow-hidden transition ${
                    active ? "ring-2 ring-black" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex">
                    <div className="w-28 h-20 bg-gray-100 shrink-0">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                          —
                        </div>
                      )}
                    </div>

                    <div className="p-3 flex-1">
                      <div className="flex justify-between gap-3">
                        <div className="font-medium">{p.title}</div>
                        {p.price_hour !== null && (
                          <div className="text-sm whitespace-nowrap">
                            {p.price_hour} CHF/h
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-gray-600 mt-1">
                        {formatAddress(p) || "Adresse non renseignée"}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={UI.chip}>
                          {p.parking_type === "indoor"
                            ? "Intérieur"
                            : p.parking_type === "garage"
                            ? "Garage"
                            : "Extérieur"}
                        </span>
                        <span className={UI.chip}>
                          {p.is_covered ? "Couverte" : "Non couverte"}
                        </span>
                        {p.has_ev_charger && <span className={UI.chip}>⚡ EV</span>}
                        {p.is_secure && <span className={UI.chip}>🔒</span>}
                        {p.is_lit && <span className={UI.chip}>💡</span>}
                      </div>

                      <div className="mt-2">
                        <Link
                          href={`/parkings/${p.id}`}
                          className="underline text-xs"
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
              <p className="text-sm text-gray-600">
                Aucune place trouvée pour ce rayon.
              </p>
            )}
          </div>
        </section>

        {/* ===== MAP ===== */}
        <section className="border rounded overflow-hidden">
          <MapContainer
            ref={setMapRef}
            center={center}
            zoom={12}
            style={{ height: 520, width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Marqueur utilisateur */}
            {me ? (
              <>
                <Marker position={[me.lat, me.lng]} icon={userIcon()}>
                  <Popup autoPan>
                    <div className="text-sm">
                      <div className="font-semibold">Vous</div>
                      <div className="text-xs text-gray-600">
                        Position actuelle
                      </div>
                    </div>
                  </Popup>
                </Marker>

                {/* Cercle rayon */}
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
                eventHandlers={{ click: () => setSelectedId(p.id) }}
              >
                {selectedId === p.id && (
                  <Popup autoPan>
                    <div className="text-sm">
                      <div className="font-semibold">{p.title}</div>
                      <div className="text-xs text-gray-600">
                        {formatAddress(p)}
                      </div>
                      {p.price_hour !== null && (
                        <div className="mt-1">
                          <b>{p.price_hour} CHF/h</b>
                        </div>
                      )}
                      <div className="mt-2">
                        <a className="underline" href={`/parkings/${p.id}`}>
                          Voir la place →
                        </a>
                      </div>
                    </div>
                  </Popup>
                )}
              </Marker>
            ))}
          </MapContainer>
        </section>
      </div>
    </main>
  );
}
