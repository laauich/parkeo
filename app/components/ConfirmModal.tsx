"use client";

import { useEffect } from "react";

type SummaryTone = "success" | "warning" | "danger" | "info";

function toneClasses(tone: SummaryTone) {
  switch (tone) {
    case "success":
      return {
        box: "border-green-200 bg-green-50",
        badge: "bg-green-600 text-white",
        title: "text-green-800",
      };
    case "warning":
      return {
        box: "border-amber-200 bg-amber-50",
        badge: "bg-amber-600 text-white",
        title: "text-amber-800",
      };
    case "danger":
      return {
        box: "border-red-200 bg-red-50",
        badge: "bg-red-600 text-white",
        title: "text-red-800",
      };
    default:
      return {
        box: "border-blue-200 bg-blue-50",
        badge: "bg-blue-600 text-white",
        title: "text-blue-800",
      };
  }
}

export default function ConfirmModal({
  open,
  title,
  lines,

  // ✅ résumé visuel
  summary,
  summaryTone = "info",

  confirmLabel = "Confirmer",
  cancelLabel = "Retour",
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  lines: string[];

  summary?: {
    badge?: string; // ex: "Remboursable ✅"
    title?: string; // ex: "Remboursement automatique"
    text?: string;  // ex: "Le client sera remboursé..."
  };
  summaryTone?: SummaryTone;

  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
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

  const tc = toneClasses(summaryTone);

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog" aria-label={title}>
      {/* Overlay */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Fermer"
      />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="p-5 border-b">
            <div className="text-lg font-semibold">{title}</div>
          </div>

          <div className="p-5 space-y-3">
            {/* ✅ Résumé visuel */}
            {summary?.title || summary?.text || summary?.badge ? (
              <div className={`border rounded-lg p-3 ${tc.box}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {summary.title ? (
                      <div className={`text-sm font-semibold ${tc.title}`}>
                        {summary.title}
                      </div>
                    ) : null}

                    {summary.text ? (
                      <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                        {summary.text}
                      </div>
                    ) : null}
                  </div>

                  {summary.badge ? (
                    <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${tc.badge}`}>
                      {summary.badge}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Détails */}
            <div className="space-y-2 text-sm text-gray-700">
              {lines.map((l, idx) => (
                <p key={idx} className="whitespace-pre-wrap">
                  {l}
                </p>
              ))}
            </div>
          </div>

          <div className="p-5 border-t flex items-center justify-end gap-2">
            <button
              type="button"
              className="border rounded px-4 py-2 text-sm"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel}
            </button>

            <button
              type="button"
              className={`rounded px-4 py-2 text-sm font-medium ${
                danger
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-black text-white hover:bg-black/90"
              } disabled:opacity-60`}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
