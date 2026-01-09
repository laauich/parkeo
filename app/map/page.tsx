// app/map/page.tsx
import type { Metadata } from "next";
import dynamicImport from "next/dynamic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Carte des parkings à Genève",
  description:
    "Carte interactive pour trouver une place de parking à Genève. Vue carte avec accès direct aux places disponibles.",
  alternates: { canonical: "/map" },
  openGraph: {
    title: "Carte des parkings à Genève | Parkeo",
    description:
      "Carte interactive pour trouver une place de parking à Genève. Vue carte avec accès direct aux places disponibles.",
    url: "/map",
    type: "website",
  },
};

/**
 * ⚠️ Leaflet utilise `window`
 * → chargement dynamique
 * → SSR désactivé
 */
const MapClient = dynamicImport(() => import("./map-client"), {
  ssr: false,
});

export default function MapPage() {
  return <MapClient />;
}
