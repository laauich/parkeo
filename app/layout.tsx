import "./globals.css";
import Link from "next/link";
import NavbarClient from "./components/NavbarClient";
import { AuthProvider } from "./providers/AuthProvider";
import NavLinksClient from "./components/NavLinksClient";
import { Toaster } from "sonner";

export const metadata = {
  title: "Parkeo",
  description: "Louez et réservez des places de parking à Genève",
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
          <header className="border-b">
            <div className="max-w-5xl mx-auto p-4 flex items-center justify-between">
              <Link href="/" className="font-semibold">
                Parkeo
              </Link>

              <nav className="flex items-center gap-4 text-sm">
                <Link className="underline" href="/parkings">
                  Parkings
                </Link>
                <Link className="underline" href="/my-bookings">
                  Mes réservations
                </Link>

                <NavLinksClient />

                <NavbarClient />
              </nav>
            </div>
          </header>

          <div className="max-w-5xl mx-auto p-6">{children}</div>

          <Toaster position="top-center" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}