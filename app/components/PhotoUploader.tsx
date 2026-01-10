// app/components/PhotoUploader.tsx
"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UI } from "@/app/components/ui";

type Props = {
  parkingId: string;
  value?: string[] | null;
  onChange: (urls: string[]) => void;
  maxPhotos?: number; // défaut 3
};

function safeFileName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.\-_]/g, "");
}

export default function PhotoUploader({
  parkingId,
  value,
  onChange,
  maxPhotos = 3,
}: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = Array.isArray(value) ? value.filter(Boolean) : [];
  const canUploadMore = current.length < maxPhotos;
  const remaining = Math.max(0, maxPhotos - current.length);

  const upload = async (files: FileList | null) => {
    setError(null);

    if (!files || files.length === 0) return;
    if (!parkingId) {
      setError("parkingId manquant.");
      return;
    }

    const { data: s } = await supabase.auth.getSession();
    const session = s.session;
    if (!session) {
      setError("Tu dois être connecté pour ajouter des photos.");
      return;
    }

    const picked = Array.from(files).slice(0, remaining);
    if (picked.length === 0) {
      setError(`Limite atteinte (${maxPhotos} photos max).`);
      return;
    }

    setUploading(true);

    try {
      const userId = session.user.id;
      const newUrls: string[] = [];

      for (const file of picked) {
        if (!file.type.startsWith("image/")) continue;

        const cleaned = safeFileName(file.name);
        const ext =
          cleaned.split(".").pop() ||
          (file.type === "image/png" ? "png" : "jpg");

        const base =
          safeFileName(file.name.replace(/\.[^/.]+$/, "")) || "photo";

        const fileName = `${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}-${base}.${ext}`;

        const filePath = `${userId}/${parkingId}/${fileName}`;

        const { error: upErr } = await supabase.storage
          .from("parkings")
          .upload(filePath, file, {
            upsert: true,
            contentType: file.type,
          });

        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabase.storage
          .from("parkings")
          .getPublicUrl(filePath);

        if (!pub?.publicUrl) throw new Error("URL publique introuvable.");

        newUrls.push(pub.publicUrl);
      }

      if (newUrls.length === 0) {
        setError("Aucune image valide sélectionnée.");
      } else {
        onChange([...current, ...newUrls]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload inconnue");
    } finally {
      setUploading(false);
    }
  };

  const removeUrl = async (url: string) => {
    setError(null);

    try {
      const { data: s } = await supabase.auth.getSession();
      const session = s.session;

      // UI first
      onChange(current.filter((u) => u !== url));

      // Best-effort storage delete
      if (!session) return;

      const marker = "/storage/v1/object/public/parkings/";
      const idx = url.indexOf(marker);
      const path = idx >= 0 ? url.slice(idx + marker.length) : null;

      if (path) {
        await supabase.storage.from("parkings").remove([path]);
      }
    } catch {
      onChange(current.filter((u) => u !== url));
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900">Photos (optionnel)</div>
            <p className={UI.subtle}>
              Conseil : 1 à {maxPhotos} photo(s), bien cadrées, bonne lumière.
            </p>
          </div>

          <span className={UI.chip}>
            {current.length}/{maxPhotos}
          </span>
        </div>

        {/* Upload button (styled) */}
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={[
              UI.btnBase,
              canUploadMore ? UI.btnGhost : "opacity-60 cursor-not-allowed",
              uploading ? "pointer-events-none" : "",
              "relative overflow-hidden",
            ].join(" ")}
            title={!canUploadMore ? "Limite atteinte" : ""}
          >
            {uploading ? "Upload…" : canUploadMore ? `Ajouter (${remaining} restant)` : "Limite atteinte"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading || !canUploadMore}
              onChange={(e) => upload(e.target.files)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>

          {uploading ? <span className={UI.subtle}>Envoi en cours…</span> : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
            <p className="text-sm text-rose-700">
              <b>Erreur :</b> {error}
            </p>
          </div>
        ) : null}
      </div>

      {/* Preview */}
      {current.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {current.map((url) => (
            <div
              key={url}
              className="rounded-2xl overflow-hidden border border-slate-200/70 bg-white/70 backdrop-blur"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-28 object-cover" />

              <div className="p-2">
                <button
                  type="button"
                  className={`${UI.btnBase} ${UI.btnDanger} w-full`}
                  onClick={() => removeUrl(url)}
                  disabled={uploading}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`${UI.card} ${UI.cardPad}`}>
          <p className={UI.p}>Aucune photo.</p>
        </div>
      )}
    </div>
  );
}
