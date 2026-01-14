"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type NavItem = {
  href: string;
  label: React.ReactNode; // label peut être du texte OU un badge (MessagesLabel)
};

export default function MobileNav({
  brand,
  items,
  actionsTop,
  actionsBottom,
}: {
  brand: { href: string; label: string };
  items: NavItem[];
  actionsTop?: React.ReactNode; // ex: bouton "Proposer"
  actionsBottom?: React.ReactNode; // ex: login/logout + email
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const activeLabel = useMemo(() => {
    const hit = items.find((x) => {
      const href = x.href;
      return pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));
    });
    // si label est ReactNode, on ne peut pas extraire une string proprement => on affiche "Menu"
    return hit ? "Menu" : "Menu";
  }, [items, pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));

  const linkClass = (href: string) =>
    [
      "w-full px-3 py-3 rounded-xl text-sm transition",
      isActive(href)
        ? "bg-slate-900 text-white"
        : "bg-white text-slate-800 hover:bg-slate-50",
    ].join(" ");

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl shadow-sm">
      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link
          href={brand.href}
          className="font-semibold tracking-tight text-slate-900 px-2 py-1 rounded-xl hover:bg-white/60 transition"
          onClick={() => setOpen(false)}
        >
          {brand.label}
        </Link>

        {/* Desktop: on ne gère PAS ici, c’est NavbarClient qui gère */}
        <div className="md:hidden flex items-center gap-2">
          <button
            type="button"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-900 shadow-sm"
          >
            <span className="mr-2">{activeLabel}</span>
            <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {/* Dropdown mobile */}
      {open ? (
        <div className="md:hidden border-t border-slate-200/70 bg-white/85 backdrop-blur">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-3 space-y-3">
            {actionsTop ? <div className="flex flex-col gap-2">{actionsTop}</div> : null}

            <div className="grid gap-1">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={linkClass(it.href)}
                  onClick={() => setOpen(false)}
                >
                  {it.label}
                </Link>
              ))}
            </div>

            {actionsBottom ? <div className="pt-2 flex flex-col gap-2">{actionsBottom}</div> : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
