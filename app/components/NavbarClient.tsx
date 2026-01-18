// app/components/NavbarClient.tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useUnreadCount } from "@/app/hooks/useUnreadCount";

type OwnerUnseenResponse =
  | { ok: true; unseen: number }
  | { ok: false; error: string; detail?: string };

export default function NavbarClient() {
  const { ready, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  // ✅ submenu "Propriétaire"
  const [ownerOpen, setOwnerOpen] = useState(false);

  // ✅ badge "nouvelles réservations owner"
  const [ownerUnseen, setOwnerUnseen] = useState<number>(0);

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

  // ✅ Owner badge helpers (localStorage)
  const OWNER_SEEN_KEY = "owner:lastSeenBookingAt";
  const OWNER_CNT_KEY = "owner:unseenCount";

  const readOwnerCountLocal = () => {
    if (typeof window === "undefined") return 0;
    const n = Number(window.localStorage.getItem(OWNER_CNT_KEY) || "0");
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const writeOwnerCountLocal = (n: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OWNER_CNT_KEY, String(Math.max(0, n)));
  };

  const resetOwnerBadge = () => {
    if (typeof window === "undefined") return;
    const nowIso = new Date().toISOString();
    window.localStorage.setItem(OWNER_SEEN_KEY, nowIso);
    writeOwnerCountLocal(0);
    setOwnerUnseen(0);
  };

  // ✅ init ownerUnseen depuis localStorage (une seule fois)
  useEffect(() => {
    if (typeof window === "undefined") return;
    // setState dans effect OK ici, mais React dev peut râler si fait "synchro" dans la branche
    // on le fait via microtask pour éviter warning
    queueMicrotask(() => setOwnerUnseen(readOwnerCountLocal()));
  }, []);

  // ✅ Poll unseen owner bookings (uniquement si connecté)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // pas connecté => on stoppe le polling, et on remet à zéro via microtask (pas synchro)
    if (!session?.access_token) {
      queueMicrotask(() => setOwnerUnseen(0));
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const since = window.localStorage.getItem(OWNER_SEEN_KEY) || "";
        const url = since
          ? `/api/owner/bookings/unseen-count?since=${encodeURIComponent(since)}`
          : `/api/owner/bookings/unseen-count`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const json = (await res.json().catch(() => ({}))) as OwnerUnseenResponse;
        if (!res.ok || !json || json.ok === false) return;

        const unseen = Number(json.unseen || 0);
        if (!Number.isFinite(unseen)) return;

        writeOwnerCountLocal(unseen);

        if (!cancelled) {
          // setState dans callback async => OK
          setOwnerUnseen(unseen);
        }
      } catch {
        // ignore
      }
    };

    void check();
    const t = window.setInterval(check, 25_000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [session?.access_token]);

  // ✅ close helpers
  const closeAll = () => {
    setOpen(false);
    setOwnerOpen(false);
  };

  const closeOwnerOnly = () => setOwnerOpen(false);

  // ✅ Ferme menus si navigation (sans warning)
  useEffect(() => {
    queueMicrotask(() => {
      setOpen(false);
      setOwnerOpen(false);
    });
  }, [pathname]);

  // ✅ Fix responsive : si on repasse en desktop, on ferme les menus
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)"); // md
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

  // ✅ Click outside (desktop+mobile)
  const ownerWrapDesktopRef = useRef<HTMLDivElement | null>(null);
  const ownerWrapMobileRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ownerOpen && !open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (ownerOpen) {
        const d = ownerWrapDesktopRef.current;
        const m = ownerWrapMobileRef.current;

        const insideDesktop = d ? d.contains(target) : false;
        const insideMobile = m ? m.contains(target) : false;

        if (!insideDesktop && !insideMobile) {
          setOwnerOpen(false);
        }
      }

      if (open) {
        const mm = mobileMenuRef.current;
        if (mm && !mm.contains(target)) {
          setOpen(false);
          setOwnerOpen(false);
        }
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [ownerOpen, open]);

  const mobileLinkClass = (href: string) =>
    [navClass(href), "w-full block text-left"].join(" ");

  // Propriétaire: actif si une des pages est active
  const ownerActive =
    isActive("/my-parkings") ||
    isActive("/my-parkings/bookings") ||
    isActive("/owner/payouts");

  const ownerTriggerClass = [
    "w-full md:w-auto",
    "inline-flex items-center justify-between md:justify-center gap-2",
    "px-3 py-1.5 rounded-xl",
    "border",
    ownerActive || ownerOpen
      ? "bg-violet-100/70 text-slate-900 border-violet-200 ring-1 ring-violet-200"
      : "bg-white/60 text-slate-700 border-slate-200/70 hover:bg-slate-100/80",
  ].join(" ");

  const OwnerBadge =
    ownerUnseen > 0 ? (
      <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-semibold bg-rose-600 text-white">
        {ownerUnseen > 99 ? "99+" : ownerUnseen}
      </span>
    ) : null;

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

            {/* ✅ Groupe Propriétaire (desktop) */}
            <div className="relative" ref={ownerWrapDesktopRef}>
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
                  <span className="inline-flex items-center gap-2">
                    Propriétaire
                    {OwnerBadge}
                  </span>
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
                  className="absolute left-0 mt-2 w-64 rounded-2xl border border-slate-200/70 bg-white/95 backdrop-blur shadow-lg p-2 z-50"
                >
                  <div className="flex flex-col gap-1">
                    <Link
                      className={[navClass("/my-parkings"), "w-full block"].join(" ")}
                      href="/my-parkings"
                      onClick={() => {
                        resetOwnerBadge(); // ✅ clear badge on enter owner
                        closeOwnerOnly();
                        closeAll();
                      }}
                    >
                      Mes places
                    </Link>

                    <Link
                      className={[navClass("/my-parkings/bookings"), "w-full block"].join(" ")}
                      href="/my-parkings/bookings"
                      onClick={() => {
                        resetOwnerBadge(); // ✅ clear badge on enter owner
                        closeOwnerOnly();
                        closeAll();
                      }}
                    >
                      Réservations (mes places)
                    </Link>

                    <Link
                      className={[navClass("/owner/payouts"), "w-full block"].join(" ")}
                      href="/owner/payouts"
                      onClick={() => {
                        resetOwnerBadge(); // ✅ clear badge on enter owner
                        closeOwnerOnly();
                        closeAll();
                      }}
                    >
                      Configurer mes paiements
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </nav>
        </div>

        {/* Right */}
        <div className="hidden md:flex items-center gap-2">
          <Link href="/parkings/new" className={btnPrimaryPill} onClick={closeAll}>
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
                onClick={() => {
                  closeAll();
                  resetOwnerBadge(); // ✅ clean local badge at logout too
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

        {/* Mobile button */}
        <button
          type="button"
          className={["md:hidden", btnGhostPill].join(" ")}
          onClick={() => {
            setOpen((v) => {
              const next = !v;
              if (!next) setOwnerOpen(false);
              return next;
            });
          }}
          aria-label="Menu"
          aria-expanded={open}
        >
          {open ? "Fermer" : "☰ Menu"}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          ref={mobileMenuRef}
          className="md:hidden border-t border-slate-200/70 bg-white/85 backdrop-blur"
        >
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-3 space-y-2">
            <Link className={mobileLinkClass("/map")} href="/map" onClick={closeAll}>
              Carte
            </Link>

            <Link className={mobileLinkClass("/parkings")} href="/parkings" onClick={closeAll}>
              Parkings
            </Link>

            <Link className={mobileLinkClass("/messages")} href="/messages" onClick={closeAll}>
              {MessagesLabel}
            </Link>

            <Link className={mobileLinkClass("/my-bookings")} href="/my-bookings" onClick={closeAll}>
              Réservations
            </Link>

            {/* ✅ Accordéon Propriétaire (mobile) */}
            <div className="pt-1" ref={ownerWrapMobileRef}>
              <button
                type="button"
                className={[ownerTriggerClass, "w-full", "text-left"].join(" ")}
                onClick={() => setOwnerOpen((v) => !v)}
                aria-expanded={ownerOpen}
                aria-controls="owner-submenu-mobile"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-violet-600/10 text-violet-700 text-sm">
                    P
                  </span>
                  <span className="inline-flex items-center gap-2">
                    Propriétaire
                    {OwnerBadge}
                  </span>
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
                  <Link
                    className={mobileLinkClass("/my-parkings")}
                    href="/my-parkings"
                    onClick={() => {
                      resetOwnerBadge();
                      closeAll();
                    }}
                  >
                    Mes places
                  </Link>

                  <Link
                    className={mobileLinkClass("/my-parkings/bookings")}
                    href="/my-parkings/bookings"
                    onClick={() => {
                      resetOwnerBadge();
                      closeAll();
                    }}
                  >
                    Réservations (mes places)
                  </Link>

                  <Link
                    className={mobileLinkClass("/owner/payouts")}
                    href="/owner/payouts"
                    onClick={() => {
                      resetOwnerBadge();
                      closeAll();
                    }}
                  >
                    Configurer mes paiements
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
                      resetOwnerBadge();
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
