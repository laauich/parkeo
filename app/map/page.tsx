// app/map/page.tsx
import type { Metadata } from "next";
import MapClient from "./map-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Carte des parkings à Genève",
  description:
    "Carte interactive pour trouver une place de parking à Genève. Filtre par distance et accès direct aux détails des places disponibles.",
  alternates: { canonical: "/map" },
  openGraph: {
    title: "Carte des parkings à Genève | Parkeo",
    description:
      "Carte interactive pour trouver une place de parking à Genève. Filtre par distance et accès direct aux détails des places disponibles.",
    url: "/map",
    type: "website",
  },
};

export default function MapPage() {
  return <MapClient />;
}
