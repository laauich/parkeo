"use client";

import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useUnreadCount } from "@/app/hooks/useUnreadCount";

export default function NavbarClient() {
  const { ready, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  // ✅ submenu "Propriétaire"
  const [ownerOpen, setOwnerOpen] = useState(false);

  const pathname = usePathname();
  const email = useMemo(() => session?.user?.email ?? null, [session]);

  const { unreadCount, badge } = useUnreadCount();

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

  // ✅ ferme menu mobile si on passe en desktop
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) {
        setOpen(false);
        setOwnerOpen(false);
      }
    };

    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ✅ ferme menus si navigation
  useEffect(() => {
    setOpen(false);
    setOwnerOpen(false);
  }, [pathname]);

  // Helpers stacked mobile
  const mobileLinkClass = (href: string) => [navClass(href), "w-full block text-left"].join(" ");

  // Propriétaire: actif si une des pages est active
  const ownerActive = isActive("/my-parkings") || isActive("/my-parkings/bookings");

  // Bouton accordéon propriétaire (visuel clair)
  const ownerTriggerClass = [
    "w-full md:w-auto",
    "inline-flex items-center justify-between md:justify-center gap-2",
    "px-3 py-1.5 rounded-xl",
    "border",
    ownerActive || ownerOpen
      ? "bg-violet-100/70 text-slate-900 border-violet-200 ring-1 ring-violet-200"
      : "bg-white/60 text-slate-700 border-slate-200/70 hover:bg-slate-100/80",
  ].join(" ");

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
            onClick={() => {
              setOpen(false);
              setOwnerOpen(false);
            }}
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

            {/* ✅ Groupe Propriétaire (desktop) */}
            <div className="relative">
              <button
                type="button"
                className={ownerTriggerClass}
                aria-expanded={ownerOpen}
                aria-controls="owner-submenu-desktop"
                onClick={() => setOwnerOpen((v) => !v)}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-violet-600/10 text-violet-700 text-sm">
                    P
                  </span>
                  Propriétaire
                </span>

                <span
                  className={[
                    "text-slate-600 transition-transform",
                    ownerOpen ? "rotate-180" : "rotate-0",
                  ].join(" ")}
                >
                  ▾
                </span>
              </button>

              {ownerOpen ? (
                <div
                  id="owner-submenu-desktop"
                  className="absolute left-0 mt-2 w-56 rounded-2xl border border-slate-200/70 bg-white/95 backdrop-blur shadow-lg p-2 z-50"
                >
                  <div className="flex flex-col gap-1">
                    <Link
                      className={[
                        navClass("/my-parkings"),
                        "w-full block",
                        "justify-start",
                      ].join(" ")}
                      href="/my-parkings"
                      onClick={() => setOwnerOpen(false)}
                    >
                      Mes places
                    </Link>

                    <Link
                      className={[
                        navClass("/my-parkings/bookings"),
                        "w-full block",
                        "justify-start",
                      ].join(" ")}
                      href="/my-parkings/bookings"
                      onClick={() => setOwnerOpen(false)}
                    >
                      Réservations (mes places)
                    </Link>
                  </div>
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

        {/* Mobile button */}
        <button
          type="button"
          className={["md:hidden", btnGhostPill].join(" ")}
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
        >
          {open ? "Fermer" : "☰ Menu"}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-slate-200/70 bg-white/85 backdrop-blur">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-3 space-y-2">
            <Link className={mobileLinkClass("/map")} href="/map" onClick={() => setOpen(false)}>
              Carte
            </Link>
            <Link
              className={mobileLinkClass("/parkings")}
              href="/parkings"
              onClick={() => setOpen(false)}
            >
              Parkings
            </Link>
            <Link
              className={mobileLinkClass("/messages")}
              href="/messages"
              onClick={() => setOpen(false)}
            >
              {MessagesLabel}
            </Link>
            <Link
              className={mobileLinkClass("/my-bookings")}
              href="/my-bookings"
              onClick={() => setOpen(false)}
            >
              Réservations
            </Link>

            {/* ✅ Accordéon Propriétaire (mobile) */}
            <div className="pt-1">
              <button
                type="button"
                className={[
                  ownerTriggerClass,
                  "w-full",
                  "text-left",
                ].join(" ")}
                onClick={() => setOwnerOpen((v) => !v)}
                aria-expanded={ownerOpen}
                aria-controls="owner-submenu-mobile"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-violet-600/10 text-violet-700 text-sm">
                    P
                  </span>
                  Propriétaire
                </span>
                <span
                  className={[
                    "text-slate-600 transition-transform",
                    ownerOpen ? "rotate-180" : "rotate-0",
                  ].join(" ")}
                >
                  ▾
                </span>
              </button>

              {ownerOpen ? (
                <div
                  id="owner-submenu-mobile"
                  className="mt-2 ml-2 pl-3 border-l border-slate-200/70 flex flex-col gap-2"
                >
                  {/* ✅ bien stacked */}
                  <Link
                    className={["w-full block", mobileLinkClass("/my-parkings")].join(" ")}
                    href="/my-parkings"
                    onClick={() => setOpen(false)}
                  >
                    Mes places
                  </Link>

                  <Link
                    className={["w-full block", mobileLinkClass("/my-parkings/bookings")].join(" ")}
                    href="/my-parkings/bookings"
                    onClick={() => setOpen(false)}
                  >
                    Réservations (mes places)
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link href="/parkings/new" className={btnPrimaryPill} onClick={() => setOpen(false)}>
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
                <Link href="/login" className={btnGhostPill} onClick={() => setOpen(false)}>
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
