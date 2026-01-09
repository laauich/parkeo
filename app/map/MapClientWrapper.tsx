"use client";

import dynamic from "next/dynamic";

// ✅ Charge MapClient uniquement côté navigateur (Leaflet = window)
const MapClient = dynamic(() => import("./map-client"), { ssr: false });

export default function MapClientWrapper() {
  return <MapClient />;
}
