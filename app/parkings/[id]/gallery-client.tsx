"use client";

import { useMemo, useState } from "react";

export default function GalleryClient({ photos }: { photos: string[] }) {
  const safe = useMemo(() => (Array.isArray(photos) ? photos.filter(Boolean) : []), [photos]);
  const [active, setActive] = useState(0);

  if (!safe.length) {
    return (
      <div className="h-56 w-full bg-gray-100 rounded flex items-center justify-center text-sm text-gray-500">
        Pas de photo
      </div>
    );
  }

  const main = safe[Math.min(active, safe.length - 1)];

  return (
    <div className="space-y-3">
      <div className="border rounded overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt="Photo parking" className="w-full h-72 object-cover" />
      </div>

      {safe.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {safe.map((u, idx) => (
            <button
              key={u + idx}
              type="button"
              onClick={() => setActive(idx)}
              className={`border rounded overflow-hidden shrink-0 ${
                idx === active ? "ring-2 ring-black" : ""
              }`}
              aria-label={`Photo ${idx + 1}`}
              style={{ width: 96, height: 64 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
