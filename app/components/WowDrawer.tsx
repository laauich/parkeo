"use client";

import { ReactNode, useEffect } from "react";
import { UI } from "@/app/components/ui";

export default function WowDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* overlay */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* panel */}
      <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-slate-200/70">
        <div className="p-5 border-b border-slate-200/70 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">Détails réservation</div>
            <div className="text-lg font-semibold text-slate-900 truncate">{title}</div>
          </div>
          <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
