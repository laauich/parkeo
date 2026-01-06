// app/my-parkings/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type ParkingRow = {
  id: string;
  owner_id: string;
  title: string;
  address: string;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  parking_type: "outdoor" | "indoor" | "garage" | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  price_hour: number | null;
  price_day: number | null;

  photos: string[] | null;
  is_active: boolean | null;

  created_at: string;
};

function typeLabel(t: ParkingRow["parking_type"]) {
  if (t === "indoor") return "Intérieur";
  if (t === "garage") return "Garage";
  return "Extérieur";
}

function safeFirstPhoto(p: ParkingRow) {
  const u = p.photos?.[0];
  return typeof u === "string" && u.trim().length > 0 ? u : null;
}

export default function MyParkingsPage() {
  const { ready, session, supabase } = useAuth();

  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("parkings")
      .select(
        `
        id,
        owner_id,
        title,
        address,
        street,
        street_number,
        postal_code,
        city,
        parking_type,
        is_covered,
        has_ev_charger,
        is_secure,
        is_lit,
        price_hour,
        price_day,
        photos,
        is_active,
        created_at
      `
      )
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ParkingRow[]);
    }

    setLoading(false);
  };

  // ✅ évite la règle ESLint “set-state-in-effect”
  useEffect(() => {
    if (!ready || !session) return;
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session]);

  const activeCount = useMemo(
    () => rows.filter((r) => r.is_active).length,
    [rows]
  );

  return (
    <main className={`${UI.page}`}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        {/* Header */}
        <div className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h1}>Mes places</h1>
            <p className={UI.p}>
              Gérez vos annonces, modifiez les infos, et suivez les réservations.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <span className={UI.chip}>
                {rows.length} place(s) · {activeCount} active(s)
              </span>
              <span className={UI.chip}>Style: violet premium</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/parkings/new"
              className={`${UI.btnBase} ${UI.btnPrimary}`}
            >
              + Proposer une place
            </Link>

            <button
              type="button"
              onClick={() => void load()}
              disabled={!session || loading}
              className={`${UI.btnBase} ${UI.btnGhost}`}
              title={!session ? "Connecte-toi d’abord" : "Rafraîchir"}
            >
              {loading ? "…" : "Rafraîchir"}
            </button>
          </div>
        </div>

        {/* Auth states */}
        {!ready ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        ) : !session ? (
          <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
            <p className={UI.p}>
              Tu dois être connecté pour voir tes places.
            </p>
            <div className="flex gap-2">
              <Link
                href="/login"
                className={`${UI.btnBase} ${UI.btnPrimary}`}
              >
                Se connecter
              </Link>
              <Link href="/parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
                Parcourir les places
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Error */}
            {error ? (
              <div className={`${UI.card} ${UI.cardPad}`}>
                <p className="text-sm text-rose-700">Erreur : {error}</p>
              </div>
            ) : null}

            {/* Grid */}
            {rows.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rows.map((p) => {
                  const photo = safeFirstPhoto(p);

                  return (
                    <div
                      key={p.id}
                      className={`${UI.card} ${UI.cardHover} overflow-hidden`}
                    >
                      {/* cover */}
                      <div className="h-40 bg-slate-100">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                            Aucune photo
                          </div>
                        )}
                      </div>

                      <div className={`${UI.cardPad} space-y-3`}>
                        {/* title + status */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {p.title}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {p.address}
                            </div>
                          </div>

                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              p.is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-50 text-slate-600 border border-slate-200"
                            }`}
                            title={p.is_active ? "Active" : "Inactive"}
                          >
                            {p.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>

                        {/* chips */}
                        <div className="flex flex-wrap gap-2">
                          <span className={UI.chip}>{typeLabel(p.parking_type)}</span>
                          <span className={UI.chip}>
                            {p.is_covered ? "Couverte" : "Non couverte"}
                          </span>
                          {p.has_ev_charger ? <span className={UI.chip}>⚡ EV</span> : null}
                          {p.is_secure ? <span className={UI.chip}>🔒 Sécurisé</span> : null}
                          {p.is_lit ? <span className={UI.chip}>💡 Éclairé</span> : null}
                        </div>

                        {/* price */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Prix</span>
                          <span className="font-semibold text-slate-900">
                            {p.price_hour !== null ? `${p.price_hour} CHF/h` : "—"}
                            {p.price_day ? ` · ${p.price_day} CHF/j` : ""}
                          </span>
                        </div>

                        <div className={UI.divider} />

                        {/* actions */}
                        <div className="grid grid-cols-3 gap-2">
                          <Link
                            href={`/parkings/${p.id}`}
                            className={`${UI.btnBase} ${UI.btnGhost} w-full`}
                          >
                            Ouvrir
                          </Link>

                          <Link
                            href={`/my-parkings/${p.id}/edit`}
                            className={`${UI.btnBase} ${UI.btnPrimary} w-full`}
                          >
                            Modifier
                          </Link>

                          <Link
                            href={`/my-parkings/${p.id}/bookings`}
                            className={`${UI.btnBase} ${UI.btnGhost} w-full`}
                          >
                            Réservations
                          </Link>
                        </div>

                        <p className={UI.subtle}>
                          ID: <span className="font-mono">{p.id}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
                <h2 className={UI.h2}>Aucune place pour le moment</h2>
                <p className={UI.p}>
                  Crée ta première annonce (photos + carte + options).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/parkings/new"
                    className={`${UI.btnBase} ${UI.btnPrimary}`}
                  >
                    + Proposer une place
                  </Link>
                  <Link href="/map" className={`${UI.btnBase} ${UI.btnGhost}`}>
                    Voir la carte
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
