// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import NavbarClient from "./components/NavbarClient";
import { AuthProvider } from "./providers/AuthProvider";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://parkeo.ch";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Parkeo | Réserver une place de parking à Genève",
    template: "%s | Parkeo",
  },
  description:
    "Trouvez et réservez une place de parking à Genève. Réservation à l’heure ou à la journée, paiement sécurisé.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Parkeo | Réserver une place de parking à Genève",
    description:
      "Trouvez et réservez une place de parking à Genève. Réservation à l’heure ou à la journée, paiement sécurisé.",
    url: siteUrl,
    siteName: "Parkeo",
    locale: "fr_CH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Parkeo | Réserver une place de parking à Genève",
    description:
      "Trouvez et réservez une place de parking à Genève. Réservation à l’heure ou à la journée, paiement sécurisé.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen flex flex-col">
        <AuthProvider>
          <NavbarClient />

          {/* ✅ Full width + full height (le contenu prend toute la place restante sous la navbar) */}
          <div className="flex-1 w-full">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
