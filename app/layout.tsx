// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import NavbarClient from "./components/NavbarClient";
import { AuthProvider } from "./providers/AuthProvider";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://parkeo.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: "Parkeo — Location et réservation de parkings à Genève",
    template: "%s | Parkeo",
  },
  description: "Louez et réservez des places de parking à Genève. Carte interactive, réservation à l’heure ou à la journée, paiement sécurisé.",
  applicationName: "Parkeo",

  alternates: {
    canonical: "/",
  },

  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Parkeo",
    title: "Parkeo — Location et réservation de parkings à Genève",
    description:
      "Trouvez facilement une place de parking à Genève. Réservation rapide à l’heure ou à la journée, paiement sécurisé.",
    // Optionnel: ajoute une image OG si tu en as une
    // images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Parkeo" }],
    locale: "fr_CH",
  },

  twitter: {
    card: "summary_large_image",
    title: "Parkeo — Location et réservation de parkings à Genève",
    description:
      "Carte interactive, réservation rapide, paiement sécurisé. Parkings disponibles à Genève.",
    // images: ["/og.jpg"],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          {/* ✅ Un seul menu */}
          <NavbarClient />

          {/* contenu */}
          <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
