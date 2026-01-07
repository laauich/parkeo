// app/layout.tsx
import "./globals.css";
import NavbarClient from "./components/NavbarClient";
import { AuthProvider } from "./providers/AuthProvider";
import type { Metadata } from "next";

const SITE_NAME = "Parkeo";
const SITE_URL = "https://parkeo.ch"; // ✅ ton domaine
const DEFAULT_TITLE =
  "Parkeo — Location & réservation de places de parking à Genève";
const DEFAULT_DESC =
  "Trouvez ou louez facilement une place de parking à Genève. Réservation à l’heure ou à la journée. Simple, sécurisé, local.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESC,

  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  generator: "Next.js",
  referrer: "origin-when-cross-origin",

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

  alternates: {
    canonical: "/",
  },

  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    locale: "fr_CH",
    images: [
      {
        url: "/og.jpg", // ✅ optionnel (tu peux le créer plus tard)
        width: 1200,
        height: 630,
        alt: "Parkeo — Places de parking à Genève",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    images: ["/og.jpg"], // ✅ optionnel
  },

  icons: {
    icon: "/favicon.ico",
    // apple: "/apple-touch-icon.png", // optionnel
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
