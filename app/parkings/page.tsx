// app/parkings/page.tsx
import type { Metadata } from "next";
import ParkingsClient from "./ParkingsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trouver une place de parking à Genève",
  description:
    "Liste des places de parking disponibles à Genève : filtre par type (extérieur, intérieur, garage), couverture, sécurité, éclairage, borne EV.",
  alternates: { canonical: "/parkings" },
  openGraph: {
    title: "Places de parking à Genève | Parkeo",
    description:
      "Trouvez une place de parking à Genève. Filtres utiles, photos, prix à l’heure et à la journée.",
    url: "/parkings",
    type: "website",
  },
};

export default function ParkingsPage() {
  return <ParkingsClient />;
}
