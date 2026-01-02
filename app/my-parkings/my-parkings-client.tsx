"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UI } from "@/app/components/ui";

type Parking = {
  id: string;
  title: string;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  parking_type: string | null;
  is_covered: boolean | null;
  is_active: boolean | null;
  price_hour: number | null;
  price_day: number | null;
  photos: string[] | null;
};

export default function MyParkingsClient() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string>("(chargement…)");
  const [rows, setRows] = useState<Parking[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: s, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw new Error(sErr.message);

      const user = s.session?.user;
      if (!user) {
        setSessionEmail("non connecté");
        setRows([]);
        setLoading(false);
        return;
      }

      setSessionEmail(user.email ?? "connecté");

      const { data, error } = await supabase
        .from("parkings")
        .select(
          "id,title,street,street_number,postal_code,city,parking_type,is_covered,is_active,price_hour,price_day,photos"
        )
        .eq("owner_id", user.id)
        .order("id", { ascending: false });

      if (error) throw new Error(error.message);

      // ✅ sécurité : on garde uniquement les lignes qui ont un id string non vide
      const clean = ((data ?? []) as Parking[]).filter(
        (p) => typeof p.id === "string" && p.id.length > 0 && p.id !== "undefined"
      );

      setRows(clean);
      setLoading(false);
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  const toggleActive = async (id: string, current: boolean | null) => {
    setError(null);
    setLoading(true);

    try {
      if (!id || id === "undefined") {
        throw new Error("ID de place invalide.");
      }

      const next = !current;

      const { error } = await supabase
        .from("parkings")
        .update({ is_active: next })
        .eq("id", id);

      if (error) throw new Error(error.message);

      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <div className="text-xs text-gray-600 border rounded p-3 flex items-center justify-between gap-3">
        <div>
          Session : <b>{sessionEmail}</b>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className={UI.btnGhost}
            onClick={load}
            disabled={loading}
          >
            {loading ? "…" : "Rafraîchir"}
          </button>

          {sessionEmail === "non connecté" && (
            <Link className={UI.btnGhost} href="/login">
              Se connecter
            </Link>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

      {!loading && sessionEmail !== "non connecté" && rows.length === 0 && (
        <div className="border rounded p-4 text-sm text-gray-600">
          Aucune place créée.
          <div className="mt-2">
            <Link className={UI.navLink} href="/parkings/new">
              Créer ma première place
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((p) => {
          const id = p.id; // ✅ source unique
          const photo = p.photos?.[0] ?? null;

          const addr1 = p.street
            ? `${p.street}${p.street_number ? " " + p.street_number : ""}`
            : "";
          const addr2 =
            p.postal_code || p.city
              ? `${p.postal_code ?? ""} ${p.city ?? ""}`.trim()
              : "";
          const address = [addr1, addr2].filter(Boolean).join(", ");

          const typeLabel =
            p.parking_type === "indoor"
              ? "Intérieur"
              : p.parking_type === "garage"
              ? "Garage box"
              : "Extérieur";

          return (
            <div key={id} className="border rounded overflow-hidden">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt={p.title} className="h-36 w-full object-cover" />
              ) : (
                <div className="h-36 w-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                  Pas de photo
                </div>
              )}

              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-sm text-gray-600">
                      {address || "Adresse non renseignée"}
                    </div>
                  </div>

                  <span className={UI.chip}>{p.is_active ? "ACTIVE" : "INACTIVE"}</span>
                </div>

                <div className="text-xs text-gray-600 flex flex-wrap gap-2">
                  <span className={UI.chip}>{typeLabel}</span>
                  <span className={UI.chip}>
                    {p.is_covered ? "Couverte" : "Non couverte"}
                  </span>
                  <span className={UI.chip}>
                    {Number(p.price_hour ?? 0).toFixed(2)} CHF/h
                    {typeof p.price_day === "number"
                      ? ` · ${p.price_day.toFixed(2)} CHF/j`
                      : ""}
                  </span>
                </div>

                {/* ✅ actions (uniquement si id valide) */}
                {id && id !== "undefined" ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Link className={UI.btnGhost} href={`/parkings/${id}`}>
                      Voir
                    </Link>

                    <Link className={UI.btnGhost} href={`/my-parkings/${id}/edit`}>
                      Modifier
                    </Link>

                    <button
                      type="button"
                      className={UI.btnPrimary}
                      onClick={() => toggleActive(id, p.is_active)}
                      disabled={loading}
                    >
                      {p.is_active ? "Désactiver" : "Activer"}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-red-600">
                    ID invalide : impossible de modifier cette place.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
