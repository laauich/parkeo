"use client";

import dynamicImport from "next/dynamic";

const MapClient = dynamicImport(() => import("./map-client").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <main className="max-w-6xl mx-auto p-6">
      <div className="border rounded p-4 text-sm text-gray-600">
        Chargement de la carte…
      </div>
    </main>
  ),
});

export default function MapPage() {
  return <MapClient />;
}
