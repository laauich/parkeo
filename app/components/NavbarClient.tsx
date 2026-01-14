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

  // Ferme le menu quand on passe en desktop (md+)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    onChange();

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Ferme le menu quand on change de page
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
            onClick={() => setOpen(false)}
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
            <Link className={navClass("/my-parkings")} href="/my-parkings">
              Mes places
            </Link>
          </nav>
        </div>

        {/* Right (desktop) */}
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
          {open ? "Fermer" : "Menu"}
        </button>
      </div>

      {/* ✅ Mobile dropdown (déroulant + overlay + animation) */}
      <div
        className={[
          "md:hidden",
          "overflow-hidden",
          "transition-[max-height,opacity] duration-200 ease-out",
          open ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0",
        ].join(" ")}
      >
        <div className="border-t border-slate-200/70 bg-white/85 backdrop-blur">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-3 space-y-2">
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
            <Link className={navClass("/my-parkings")} href="/my-parkings">
              Mes places
            </Link>

            {/* ✅ Ajoute ici tes pages manquantes si tu as les routes */}
            {/* <Link className={navClass("/my-reserved-parkings")} href="/my-reserved-parkings">
              Mes places réservées
            </Link> */}

            <div className="pt-2 flex flex-col gap-2">
              <Link href="/parkings/new" className={btnPrimaryPill}>
                Proposer ma place
              </Link>

              {!ready ? (
                <span className={UI.subtle}>Chargement…</span>
              ) : session ? (
                <>
                  <span className="text-xs text-slate-500 truncate bg-white/60 px-3 py-1.5 rounded-full border border-slate-200/70">
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
          </div>
        </div>
      </div>

      {/* ✅ Overlay (click dehors pour fermer) */}
      {open ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="md:hidden fixed inset-0 z-40 bg-black/20"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </header>
  );
}
