"use client";

import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export default function NavbarClient() {
  const { ready, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const pathname = usePathname();

  const email = useMemo(() => session?.user?.email ?? null, [session]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  const navClass = (href: string) =>
    [
      UI.navLink,
      "px-3 py-1.5 rounded-xl",
      isActive(href)
        ? "bg-violet-100/70 text-slate-900 ring-1 ring-violet-200"
        : "hover:bg-slate-100/80",
    ].join(" ");

  const btnPrimaryPill = [UI.btnBase, UI.btnPrimary, "rounded-full"].join(" ");
  const btnGhostPill = [UI.btnBase, UI.btnGhost, "rounded-full"].join(" ");

  return (
    <header
      className={[
        "sticky top-0 z-50",
        "border-b border-slate-200/70",
        "bg-white/70 backdrop-blur",
        "shadow-sm",
        "relative",
        // Halo violet premium
        "before:absolute before:inset-x-0 before:top-0 before:h-16",
        "before:bg-gradient-to-r before:from-violet-200/55 before:via-white/25 before:to-violet-200/55",
        "before:pointer-events-none before:-z-10",
        // fine line accent
        "after:absolute after:inset-x-0 after:bottom-0 after:h-px",
        "after:bg-gradient-to-r after:from-transparent after:via-violet-300/60 after:to-transparent",
      ].join(" ")}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className={[
              "font-semibold tracking-tight text-slate-900",
              "px-2 py-1 rounded-xl",
              "hover:bg-white/60 transition",
            ].join(" ")}
            onClick={() => setOpen(false)}
          >
            Parkeo
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link className={navClass("/map")} href="/map">
              Carte
            </Link>
            <Link className={navClass("/parkings")} href="/parkings">
              Parkings
            </Link>
            <Link className={navClass("/my-bookings")} href="/my-bookings">
              Réservations
            </Link>
            <Link className={navClass("/my-parkings")} href="/my-parkings">
              Mes places
            </Link>
          </nav>
        </div>

        {/* Right */}
        <div className="hidden md:flex items-center gap-2">
          <Link href="/parkings/new" className={btnPrimaryPill}>
            Proposer
          </Link>

          {!ready ? (
            <span className={UI.subtle}>Chargement…</span>
          ) : session ? (
            <>
              <span className="text-xs text-slate-500 max-w-[220px] truncate bg-white/60 px-3 py-1.5 rounded-full border border-slate-200/70">
                {email}
              </span>
              <button
                type="button"
                className={btnGhostPill}
                onClick={() => signOut()}
              >
                Se déconnecter
              </button>
            </>
          ) : (
            <Link href="/login" className={btnGhostPill}>
              Se connecter
            </Link>
          )}
        </div>

        {/* Mobile */}
        <button
          type="button"
          className={["md:hidden", btnGhostPill].join(" ")}
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
        >
          {open ? "Fermer" : "Menu"}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-200/70 bg-white/80 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 space-y-2">
            <Link
              className={navClass("/map")}
              href="/map"
              onClick={() => setOpen(false)}
            >
              Carte
            </Link>
            <Link
              className={navClass("/parkings")}
              href="/parkings"
              onClick={() => setOpen(false)}
            >
              Parkings
            </Link>
            <Link
              className={navClass("/my-bookings")}
              href="/my-bookings"
              onClick={() => setOpen(false)}
            >
              Réservations
            </Link>
            <Link
              className={navClass("/my-parkings")}
              href="/my-parkings"
              onClick={() => setOpen(false)}
            >
              Mes places
            </Link>

            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/parkings/new"
                className={btnPrimaryPill}
                onClick={() => setOpen(false)}
              >
                Proposer ma place
              </Link>

              {!ready ? (
                <span className={UI.subtle}>Chargement…</span>
              ) : session ? (
                <>
                  <span className="text-xs text-slate-500 truncate bg-white/60 px-3 py-1.5 rounded-full border border-slate-200/70">
                    {email}
                  </span>
                  <button
                    type="button"
                    className={btnGhostPill}
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                  >
                    Se déconnecter
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className={btnGhostPill}
                  onClick={() => setOpen(false)}
                >
                  Se connecter
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
