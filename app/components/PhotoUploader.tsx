"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Props = {
  parkingId: string;
  value?: string[] | null; // ✅ peut arriver undefined/null depuis edit-client
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

  // ✅ normalisation interne
  const current = Array.isArray(value) ? value : [];

  const canUploadMore = current.length < maxPhotos;

  const upload = async (files: FileList | null) => {
    setError(null);

    if (!files || files.length === 0) return;
    if (!parkingId) {
      setError("parkingId manquant.");
      return;
    }

    // session requise (RLS)
    const { data: s } = await supabase.auth.getSession();
    const session = s.session;
    if (!session) {
      setError("Tu dois être connecté pour ajouter des photos.");
      return;
    }

    // limite maxPhotos
    const remaining = Math.max(0, maxPhotos - current.length);
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

        // ✅ Chemin compatible RLS Storage : <userId>/<parkingId>/<file>
        const filePath = `${userId}/${parkingId}/${fileName}`;

        const { error: upErr } = await supabase.storage
          .from("parkings")
          .upload(filePath, file, {
            upsert: true,
            contentType: file.type,
          });

        if (upErr) throw new Error(upErr.message);

        // bucket public => URL publique
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

      // On enlève de l’UI quoiqu’il arrive
      onChange(current.filter((u) => u !== url));

      // Best-effort: supprimer aussi dans Storage si connecté
      if (!session) return;

      // URL publique: .../storage/v1/object/public/parkings/<path>
      const marker = "/storage/v1/object/public/parkings/";
      const idx = url.indexOf(marker);
      const path = idx >= 0 ? url.slice(idx + marker.length) : null;

      if (path) {
        await supabase.storage.from("parkings").remove([path]);
      }
    } catch {
      // on garde juste la suppression UI
      onChange(current.filter((u) => u !== url));
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">Photos (optionnel)</label>

        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading || !canUploadMore}
          onChange={(e) => upload(e.target.files)}
        />

        <div className="text-xs text-gray-500">
          Conseil : 1 à {maxPhotos} photos, bien cadrées, bonne lumière.
          {!canUploadMore ? " (limite atteinte)" : ""}
        </div>

        {uploading && <p className="text-sm text-gray-600">Upload en cours…</p>}
        {error && <p className="text-sm text-red-600">Erreur : {error}</p>}
      </div>

      {/* Preview */}
      {current.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {current.map((url) => (
            <div key={url} className="border rounded overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-24 object-cover" />
              <button
                type="button"
                className="w-full text-xs py-2 border-t hover:bg-gray-50"
                onClick={() => removeUrl(url)}
                disabled={uploading}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Aucune photo.</p>
      )}
    </div>
  );
}
