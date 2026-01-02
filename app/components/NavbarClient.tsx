"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { UI } from "@/app/components/ui";
import { useAuth } from "@/app/providers/AuthProvider";

function NavLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-sm px-3 py-2 rounded transition ${
        active ? "bg-black text-white" : "hover:bg-gray-100"
      }`}
    >
      {label}
    </Link>
  );
}

export default function NavbarClient() {
  const { ready, session, signOut } = useAuth();
  const email = session?.user?.email ?? null;

  const [open, setOpen] = useState(false);

  const links = useMemo(() => {
    // Base (tout le monde)
    const base = [
      { href: "/map", label: "Carte" },
      { href: "/parkings", label: "Trouver" },
    ];

    // Connecté : on affiche aussi "Mes places" + "Mes réservations"
    
    if (email) {
      return [
        ...base,
        { href: "/my-parkings", label: "Mes places" },
        { href: "/my-bookings", label: "Mes réservations" },
        { href: "/parkings/new", label: "Proposer" },
      ];
    }

    // Non connecté : on garde "Réservations" si tu veux (ou pas).
    // Ici je le garde car la page peut afficher "connecte-toi"
    return [
      ...base,
      { href: "/my-bookings", label: "Réservations" },
      { href: "/parkings/new", label: "Proposer" },
    ];
  }, [email]);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Link
            href="/map"
            className="font-semibold tracking-tight text-lg"
            onClick={() => setOpen(false)}
          >
            Parkeo
          </Link>
          <span className="text-xs text-gray-500 hidden sm:inline">
            Genève (MVP)
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} />
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Desktop account */}
          <div className="hidden md:flex items-center gap-2">
            {ready ? (
              email ? (
                <>
                  <span className="text-xs text-gray-600 max-w-[240px] truncate">
                    {email}
                  </span>
                  <button
                    type="button"
                    className={UI.btnGhost}
                    onClick={() => signOut()}
                  >
                    Se déconnecter
                  </button>
                </>
              ) : (
                <Link href="/login" className={UI.btnGhost}>
                  Se connecter
                </Link>
              )
            ) : (
              <span className="text-xs text-gray-500">…</span>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            className="md:hidden border rounded px-3 py-2 text-sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Ouvrir le menu"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open ? (
        <div className="md:hidden border-t bg-white">
          <div className="max-w-6xl mx-auto px-4 py-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {links.map((l) => (
                <NavLink
                  key={l.href}
                  href={l.href}
                  label={l.label}
                  onClick={() => setOpen(false)}
                />
              ))}
            </div>

            <div className="border-t pt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-600 truncate">
                {ready
                  ? email
                    ? `Connecté : ${email}`
                    : "Non connecté"
                  : "Chargement…"}
              </div>

              {ready ? (
                email ? (
                  <button
                    type="button"
                    className={UI.btnGhost}
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                  >
                    Logout
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className={UI.btnGhost}
                    onClick={() => setOpen(false)}
                  >
                    Login
                  </Link>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
