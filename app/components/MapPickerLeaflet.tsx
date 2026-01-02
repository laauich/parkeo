"use client";

import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (pos: { lat: number; lng: number } | null) => void;
};

function makePinIcon() {
  const html = `
<div style="
  width:32px;
  height:32px;
  border-radius:50%;
  background:#111;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 2px 8px rgba(0,0,0,.25);
">
  <svg xmlns="http://www.w3.org/2000/svg"
    width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="white" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/>
    <circle cx="12" cy="10" r="2"/>
  </svg>
</div>`;
  return L.divIcon({
    className: "parkeo-map-picker-pin",
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function ClickHandler({
  onPick,
}: {
  onPick: (pos: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MapPickerLeaflet({ value, onChange }: Props) {
  // Centre Genève par défaut
  const center: [number, number] = value
    ? [value.lat, value.lng]
    : [46.2044, 6.1432];

  const pin = useMemo(() => makePinIcon(), []);

  return (
    <div className="w-full">
      <MapContainer
        center={center}
        zoom={value ? 16 : 12}
        style={{ height: 320, width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClickHandler onPick={onChange} />

        {value ? (
          <Marker position={[value.lat, value.lng]} icon={pin} />
        ) : null}
      </MapContainer>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
        <span>Clique sur la carte pour placer le marqueur</span>
        <button
          type="button"
          className="underline"
          onClick={() => onChange(null)}
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
