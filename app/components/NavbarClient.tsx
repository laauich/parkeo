"use client";

import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useUnreadCount } from "@/app/hooks/useUnreadCount";

export default function NavbarClient() {
  const { ready, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  // ✅ dropdown “Propriétaire” (desktop + mobile)
  const [ownerOpen, setOwnerOpen] = useState(false);

  const pathname = usePathname();
  const email = useMemo(() => session?.user?.email ?? null, [session]);

  const { unreadCount, badge } = useUnreadCount();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  // ✅ activer “Propriétaire” si on est sur une de ses pages
  const ownerActive = useMemo(() => {
    return (
      pathname === "/my-parkings" ||
      pathname?.startsWith("/my-parkings/") ||
      pathname === "/my-parkings/bookings" ||
      pathname?.startsWith("/my-parkings/bookings/")
    );
  }, [pathname]);

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

  const MessagesLabel = (
    <span className="inline-flex items-center gap-2">
      Messages
      {unreadCount > 0 ? (
        <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-semibold bg-violet-600 text-white">
          {badge}
        </span>
      ) : null}
    </span>
  );

  // ✅ util: ferme menu mobile + dropdowns au clic lien
  const closeAll = () => {
    setOpen(false);
    setOwnerOpen(false);
  };

  return (
    <header
      className={[
        "sticky top-0 z-50",
        "border-b border-slate-200/70",
        "bg-white/70 backdrop-blur-xl",
        "shadow-sm",
        "relative",
        "before:absolute before:inset-x-0 before:top-0 before:h-16",
        "before:bg-gradient-to-r before:from-violet-200/60 before:via-white/30 before:to-violet-200/60",
        "before:pointer-events-none before:-z-10",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-px",
        "after:bg-gradient-to-r after:from-transparent after:via-violet-300/60 after:to-transparent",
      ].join(" ")}
    >
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-semibold tracking-tight text-slate-900 px-2 py-1 rounded-xl hover:bg-white/60 transition"
            onClick={closeAll}
          >
            Parkeo
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link className={navClass("/map")} href="/map">
              Carte
            </Link>
            <Link className={navClass("/parkings")} href="/parkings">
              Parkings
            </Link>
            <Link className={navClass("/messages")} href="/messages">
              {MessagesLabel}
            </Link>
            <Link className={navClass("/my-bookings")} href="/my-bookings">
              Réservations
            </Link>

            {/* ✅ Propriétaire dropdown (desktop) */}
            <div className="relative">
              <button
                type="button"
                className={[
                  UI.navLink,
                  "px-3 py-1.5 rounded-xl",
                  ownerActive
                    ? "bg-violet-100/70 text-slate-900 ring-1 ring-violet-200"
                    : "hover:bg-slate-100/80",
                ].join(" ")}
                aria-expanded={ownerOpen}
                aria-haspopup="menu"
                onClick={() => setOwnerOpen((v) => !v)}
              >
                Propriétaire <span className="ml-1">▾</span>
              </button>

              {ownerOpen ? (
                <div
                  className="absolute left-0 mt-2 w-56 rounded-2xl border border-slate-200/70 bg-white/95 backdrop-blur shadow-lg p-1 z-50"
                  role="menu"
                >
                  <Link
                    href="/my-parkings"
                    className={[
                      "block px-3 py-2 rounded-xl text-sm",
                      isActive("/my-parkings")
                        ? "bg-slate-100 text-slate-900"
                        : "hover:bg-slate-100/80 text-slate-700",
                    ].join(" ")}
                    onClick={closeAll}
                    role="menuitem"
                  >
                    Mes places
                  </Link>

                  <Link
                    href="/my-parkings/bookings"
                    className={[
                      "block px-3 py-2 rounded-xl text-sm",
                      isActive("/my-parkings/bookings")
                        ? "bg-slate-100 text-slate-900"
                        : "hover:bg-slate-100/80 text-slate-700",
                    ].join(" ")}
                    onClick={closeAll}
                    role="menuitem"
                  >
                    Réservations (mes places)
                  </Link>
                </div>
              ) : null}
            </div>
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
              <button type="button" className={btnGhostPill} onClick={signOut}>
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

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-slate-200/70 bg-white/85 backdrop-blur">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-3 space-y-2">
            <Link className={navClass("/map")} href="/map" onClick={closeAll}>
              Carte
            </Link>
            <Link className={navClass("/parkings")} href="/parkings" onClick={closeAll}>
              Parkings
            </Link>
            <Link className={navClass("/messages")} href="/messages" onClick={closeAll}>
              {MessagesLabel}
            </Link>
            <Link className={navClass("/my-bookings")} href="/my-bookings" onClick={closeAll}>
              Réservations
            </Link>

            {/* ✅ Propriétaire dropdown (mobile) */}
            <div className="pt-1">
              <button
                type="button"
                className={[
                  UI.navLink,
                  "w-full text-left px-3 py-2 rounded-xl",
                  ownerActive
                    ? "bg-violet-100/70 text-slate-900 ring-1 ring-violet-200"
                    : "hover:bg-slate-100/80",
                ].join(" ")}
                aria-expanded={ownerOpen}
                onClick={() => setOwnerOpen((v) => !v)}
              >
                <span className="flex items-center justify-between">
                  <span>Propriétaire</span>
                  <span>{ownerOpen ? "▴" : "▾"}</span>
                </span>
              </button>

              {ownerOpen ? (
                <div className="mt-2 pl-2 space-y-2">
                  <Link
                    className={navClass("/my-parkings")}
                    href="/my-parkings"
                    onClick={closeAll}
                  >
                    Mes places
                  </Link>
                  <Link
                    className={navClass("/my-parkings/bookings")}
                    href="/my-parkings/bookings"
                    onClick={closeAll}
                  >
                    Réservations (mes places)
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link href="/parkings/new" className={btnPrimaryPill} onClick={closeAll}>
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
                      closeAll();
                      signOut();
                    }}
                  >
                    Se déconnecter
                  </button>
                </>
              ) : (
                <Link href="/login" className={btnGhostPill} onClick={closeAll}>
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
