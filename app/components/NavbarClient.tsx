"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type NavItem = {
  href: string;
  label: string;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function NavbarClient() {
  const pathname = usePathname();
  const { ready, session, supabase } = useAuth();
  const userId = session?.user?.id ?? null;

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const items: NavItem[] = useMemo(
    () => [
      { href: "/map", label: "Carte" },
      { href: "/parkings", label: "Places" },
      { href: "/my-bookings", label: "Réservations" },
      { href: "/messages", label: "Messages" },
    ],
    []
  );

  const activeLabel = useMemo(() => {
    const hit = items.find((x) => isActive(pathname ?? "/", x.href));
    return hit?.label ?? "Menu";
  }, [items, pathname]);

  // ✅ Ferme le menu quand on change de page
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ✅ BroadcastChannel: refresh instant quand read/send dans l'app
  useEffect(() => {
    if (!session) return;

    const bc =
      typeof window !== "undefined"
        ? new BroadcastChannel("parkeo-unread")
        : null;

    const onMsg = () => {
      void loadUnread();
    };

    bc?.addEventListener("message", onMsg);

    return () => {
      bc?.removeEventListener("message", onMsg);
      bc?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, userId]);

  const loadUnread = async () => {
    if (!ready) return;
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    // On compte les conversations "non lues" pour l'utilisateur courant
    const { data, error } = await supabase
      .from("conversations")
      .select("id,last_message_at,last_read_owner_at,last_read_client_at,owner_id,client_id")
      .or(`owner_id.eq.${userId},client_id.eq.${userId}`)
      .limit(300);

    if (error || !data) {
      setUnreadCount(0);
      return;
    }

    const count = data.filter((c) => {
      if (!c.last_message_at) return false;
      const lm = new Date(c.last_message_at).getTime();
      const isOwner = c.owner_id === userId;
      const lr = isOwner ? c.last_read_owner_at : c.last_read_client_at;
      const lrMs = lr ? new Date(lr).getTime() : 0;
      return lm > lrMs;
    }).length;

    setUnreadCount(count);
  };

  // ✅ initial load unread
  useEffect(() => {
    if (!ready) return;
    void loadUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  // ✅ Realtime: conversation update -> refresh unread
  useEffect(() => {
    if (!session || !userId) return;

    const chOwner = supabase
      .channel(`nav-unread:owner:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `owner_id=eq.${userId}`,
        },
        () => void loadUnread()
      )
      .subscribe();

    const chClient = supabase
      .channel(`nav-unread:client:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `client_id=eq.${userId}`,
        },
        () => void loadUnread()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chOwner);
      void supabase.removeChannel(chClient);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, userId]);

  const onLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // rien
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Brand */}
          <Link href="/" className="font-semibold text-slate-900">
            Parkeo
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2">
            {items.map((it) => {
              const active = isActive(pathname ?? "/", it.href);
              const isMessages = it.href === "/messages";

              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={[
                    "relative px-3 py-2 rounded-xl text-sm border transition",
                    active
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {it.label}
                  {isMessages && unreadCount > 0 ? (
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-violet-600 text-white text-[11px] px-2 py-0.5">
                      {unreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {/* Auth actions */}
            {ready && session ? (
              <button
                type="button"
                className={`${UI.btnBase} ${UI.btnGhost} ml-2`}
                onClick={() => void onLogout()}
              >
                Déconnexion
              </button>
            ) : (
              <Link href="/login" className={`${UI.btnBase} ${UI.btnPrimary} ml-2`}>
                Se connecter
              </Link>
            )}
          </nav>

          {/* Mobile */}
          <div className="md:hidden flex items-center gap-2">
            {/* Auth button small */}
            {ready && session ? (
              <button
                type="button"
                className={`${UI.btnBase} ${UI.btnGhost}`}
                onClick={() => void onLogout()}
              >
                Logout
              </button>
            ) : (
              <Link href="/login" className={`${UI.btnBase} ${UI.btnPrimary}`}>
                Login
              </Link>
            )}

            {/* Hamburger */}
            <button
              type="button"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            >
              <span className="mr-2">{activeLabel}</span>
              <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open ? (
          <div className="md:hidden mt-3 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-2 grid gap-1">
              {items.map((it) => {
                const active = isActive(pathname ?? "/", it.href);
                const isMessages = it.href === "/messages";

                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={[
                      "flex items-center justify-between px-3 py-3 rounded-xl text-sm transition",
                      active
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-800 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span>{it.label}</span>

                    {isMessages && unreadCount > 0 ? (
                      <span
                        className={[
                          "inline-flex items-center justify-center rounded-full text-[11px] px-2 py-0.5",
                          active ? "bg-white text-slate-900" : "bg-violet-600 text-white",
                        ].join(" ")}
                      >
                        {unreadCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
