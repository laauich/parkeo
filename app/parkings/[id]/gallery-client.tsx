// app/parkings/[id]/gallery-client.tsx
"use client";

import { useMemo, useState } from "react";
import { UI } from "@/app/components/ui";

export default function GalleryClient({ photos }: { photos: string[] }) {
  const safe = useMemo(
    () => (Array.isArray(photos) ? photos.filter(Boolean) : []),
    [photos]
  );

  const [active, setActive] = useState(0);

  if (!safe.length) {
    return (
      <div
        className={[
          UI.card,
          UI.cardPad,
          "h-56 w-full flex items-center justify-center",
        ].join(" ")}
      >
        <p className={UI.p}>Pas de photo</p>
      </div>
    );
  }

  const idx = Math.min(active, safe.length - 1);
  const main = safe[idx];

  const canPrev = idx > 0;
  const canNext = idx < safe.length - 1;

  const navBtn = (disabled: boolean) =>
    [
      UI.btnBase,
      UI.btnGhost,
      "rounded-full",
      "px-3 py-2",
      "bg-white/80 backdrop-blur",
      "shadow-sm",
      disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white",
    ].join(" ");

  return (
    <div className="space-y-4">
      {/* Main image */}
      <div
        className={[
          "overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50",
          "shadow-sm",
        ].join(" ")}
      >
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={main}
            alt={`Photo parking ${idx + 1}`}
            className="w-full h-[260px] sm:h-[340px] object-cover"
            loading="eager"
          />

          {/* Counter chip */}
          <div className="absolute top-3 right-3">
            <span className={UI.chip}>
              {idx + 1}/{safe.length}
            </span>
          </div>

          {/* Prev/Next */}
          {safe.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => canPrev && setActive((v) => Math.max(0, v - 1))}
                disabled={!canPrev}
                aria-label="Photo précédente"
                className={[
                  "absolute left-3 top-1/2 -translate-y-1/2",
                  navBtn(!canPrev),
                ].join(" ")}
              >
                ←
              </button>

              <button
                type="button"
                onClick={() =>
                  canNext && setActive((v) => Math.min(safe.length - 1, v + 1))
                }
                disabled={!canNext}
                aria-label="Photo suivante"
                className={[
                  "absolute right-3 top-1/2 -translate-y-1/2",
                  navBtn(!canNext),
                ].join(" ")}
              >
                →
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Thumbnails */}
      {safe.length > 1 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {safe.map((u, i) => {
            const isActive = i === idx;

            return (
              <button
                key={`${u}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Photo ${i + 1}`}
                className={[
                  "shrink-0 overflow-hidden rounded-2xl border",
                  "bg-white/70 backdrop-blur",
                  "transition",
                  isActive
                    ? "border-violet-300 ring-2 ring-violet-300"
                    : "border-slate-200/70 hover:border-slate-300/70 hover:shadow-sm",
                ].join(" ")}
                style={{ width: 104, height: 72 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Counter chip bottom (cohérent mobile) */}
          <span className={UI.chip}>
            {idx + 1}/{safe.length}
          </span>
        </div>
      ) : null}
    </div>
  );
}
