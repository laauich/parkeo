import "./globals.css";
import NavbarClient from "./components/NavbarClient";
import { AuthProvider } from "./providers/AuthProvider";

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
          {/* ✅ Un seul menu */}
          <NavbarClient />

          {/* contenu */}
          <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
