"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type ParkingJoin = {
  id: string;
  title: string;
  address: string;

  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  photos: string[] | string | null; // ✅ support array OR json string
  price_hour: number | null;
  price_day: number | null;
};

type BookingRow = {
  id: string;
  parking_id: string;
  user_id: string;

  start_time: string;
  end_time: string;

  total_price: number | null;
  currency: string | null;

  status: string | null;
  payment_status: string | null;

  created_at: string | null;

  // ✅ join souvent en ARRAY même en 1-1
  parkings?: ParkingJoin[] | ParkingJoin | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(v: number | null, currency?: string | null) {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v} ${(currency ?? "CHF").toUpperCase()}`;
}

function getParkingFromJoin(join: BookingRow["parkings"]): ParkingJoin | null {
  if (!join) return null;
  if (Array.isArray(join)) return join[0] ?? null;
  return join;
}

function parsePhotos(raw: ParkingJoin["photos"]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("http")) return [s];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

function firstPhotoUrl(photos: string[]): string | null {
  const u = photos[0];
  if (!u) return null;
  return u;
}

function StatusChip({ b }: { b: BookingRow }) {
  const s = (b.status ?? "").toLowerCase();
  const pay = (b.payment_status ?? "").toLowerCase();

  if (s === "confirmed" && pay === "paid") {
    return (
      <span
        className={`${UI.chip} bg-emerald-50 border-emerald-200 text-emerald-700`}
      >
        Confirmée
      </span>
    );
  }
  if (s === "cancelled") {
    return (
      <span className={`${UI.chip} bg-slate-100 border-slate-200 text-slate-700`}>
        Annulée
      </span>
    );
  }
  if (s.includes("pending") || pay === "unpaid") {
    return (
      <span className={`${UI.chip} bg-amber-50 border-amber-200 text-amber-700`}>
        En attente
      </span>
    );
  }
  return <span className={UI.chip}>{b.status ?? "—"}</span>;
}

/** ✅ Règle simple UI (avant annulation) :
 * - Remboursable si annulation >= 24h avant le début
 * - Sinon non remboursable
 * (tu peux ajuster ensuite si tu veux une règle plus fine)
 */
function refundPolicyLabel(startIso: string) {
  const start = new Date(startIso).getTime();
  const now = Date.now();
  const diffH = (start - now) / (1000 * 60 * 60);

  if (Number.isNaN(start)) {
    return {
      refundable: false,
      title: "Politique inconnue",
      detail: "Impossible de calculer (date invalide).",
    };
  }

  if (diffH >= 24) {
    return {
      refundable: true,
      title: "Remboursable",
      detail: "Annulation ≥ 24h avant le début : remboursement automatique (si payé).",
    };
  }

  return {
    refundable: false,
    title: "Non remboursable",
    detail: "Annulation < 24h avant le début : pas de remboursement.",
  };
}

type CancelApiResponse =
  | { ok: true; refunded?: boolean; already?: boolean }
  | { ok: false; error: string; detail?: string };

export default function MyBookingsPage() {
  const { ready, session, supabase } = useAuth();

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [openBooking, setOpenBooking] = useState<BookingRow | null>(null);

  // ✅ ajout minimal (annulation dans la modale)
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);

  const userId = session?.user?.id ?? null;

  const load = async () => {
    if (!userId) return;

    setLoading(true);
    setPageError(null);

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        id,
        parking_id,
        user_id,
        start_time,
        end_time,
        total_price,
        currency,
        status,
        payment_status,
        created_at,
        parkings:parking_id (
          id,
          title,
          address,
          street,
          street_number,
          postal_code,
          city,
          photos,
          price_hour,
          price_day
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setPageError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as unknown as BookingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows.filter((b) => {
      const endMs = new Date(b.end_time).getTime();
      return endMs > now && (b.status ?? "").toLowerCase() !== "cancelled";
    });
  }, [rows]);

  const past = useMemo(() => {
    const now = Date.now();
    return rows.filter((b) => {
      const endMs = new Date(b.end_time).getTime();
      return endMs <= now || (b.status ?? "").toLowerCase() === "cancelled";
    });
  }, [rows]);

  const cancelBooking = async (bookingId: string, startIso: string) => {
    if (!session) return;

    setCancelMsg(null);

    const policy = refundPolicyLabel(startIso);
    const confirmText = `${policy.title}\n${policy.detail}\n\nConfirmer l’annulation ?`;

    if (!window.confirm(confirmText)) return;

    setCancelLoading(true);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId }),
      });

      const json = (await res.json().catch(() => ({}))) as CancelApiResponse;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg =
          (json as { error?: string; detail?: string })?.error ??
          `Erreur annulation (${res.status})`;
        const detail = (json as { detail?: string })?.detail;
        setCancelMsg(detail ? `${msg} — ${detail}` : msg);
        setCancelLoading(false);
        return;
      }

      // ok
      const refunded = (json as { refunded?: boolean }).refunded;
      if (refunded) setCancelMsg("Annulation effectuée ✅ Remboursement en cours.");
      else setCancelMsg("Annulation effectuée ✅");

      // refresh list
      await load();

      // fermer la modale après petit délai (optionnel)
      setTimeout(() => {
        setOpenBooking(null);
        setCancelMsg(null);
      }, 700);
    } catch (e: unknown) {
      setCancelMsg(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setCancelLoading(false);
    }
  };

  if (!ready) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section}`}>
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section}`}>
          <div className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <div>
              <h1 className={UI.h1}>Mes réservations</h1>
              <p className={UI.p}>Connecte-toi pour voir tes réservations.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/login">
                Se connecter
              </Link>
              <Link className={`${UI.btnBase} ${UI.btnGhost}`} href="/parkings">
                Trouver une place
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <div className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>Mes réservations</h1>
            <p className={UI.p}>Tes réservations à venir et passées.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={`${UI.btnBase} ${UI.btnGhost}`}
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "…" : "Rafraîchir"}
            </button>
            <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/map">
              Voir la carte
            </Link>
          </div>
        </div>

        {pageError ? (
          <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
            <p className="text-sm text-rose-700">Erreur : {pageError}</p>
            <button
              className={`${UI.btnBase} ${UI.btnGhost}`}
              onClick={() => void load()}
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <div>
              <h2 className={UI.h2}>Aucune réservation</h2>
              <p className={UI.p}>
                Réserve depuis la liste ou la carte : tu les verras ici.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/parkings">
                Trouver une place
              </Link>
              <Link className={`${UI.btnBase} ${UI.btnGhost}`} href="/map">
                Voir la carte
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* À venir */}
            <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className={UI.h2}>À venir</h2>
                <span className={UI.subtle}>{upcoming.length} réservation(s)</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((b) => {
                  const p = getParkingFromJoin(b.parkings);
                  const photos = parsePhotos(p?.photos ?? null);
                  const photo = firstPhotoUrl(photos);

                  return (
                    <div
                      key={b.id}
                      className={`${UI.card} ${UI.cardHover} overflow-hidden`}
                    >
                      <div className="h-40 bg-slate-100">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                            Aucune photo
                          </div>
                        )}
                      </div>

                      <div className={UI.cardPad}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {p?.title ?? "Place"}
                            </div>
                            <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                              {p?.address ?? "Adresse non renseignée"}
                            </div>
                          </div>
                          <StatusChip b={b} />
                        </div>

                        <div className="mt-3 space-y-1 text-sm text-slate-700">
                          <div>
                            <span className="text-slate-500">Début :</span>{" "}
                            <b>{formatDateTime(b.start_time)}</b>
                          </div>
                          <div>
                            <span className="text-slate-500">Fin :</span>{" "}
                            <b>{formatDateTime(b.end_time)}</b>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-slate-500">Total</span>
                          <b className="text-slate-900">
                            {money(b.total_price, b.currency)}
                          </b>
                        </div>

                        <div className={`${UI.divider} my-4`} />

                        <div className="flex gap-2">
                          <Link
                            href={`/parkings/${b.parking_id}`}
                            className={`${UI.btnBase} ${UI.btnGhost} flex-1`}
                          >
                            Voir la place
                          </Link>

                          <button
                            type="button"
                            className={`${UI.btnBase} ${UI.btnPrimary} flex-1`}
                            onClick={() => {
                              setCancelMsg(null);
                              setOpenBooking(b);
                            }}
                          >
                            Détails
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {upcoming.length === 0 ? (
                <p className={UI.p}>Aucune réservation à venir.</p>
              ) : null}
            </section>

            {/* Passées */}
            <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className={UI.h2}>Passées</h2>
                <span className={UI.subtle}>{past.length} réservation(s)</span>
              </div>

              <div className="space-y-3">
                {past.map((b) => {
                  const p = getParkingFromJoin(b.parkings);
                  const photos = parsePhotos(p?.photos ?? null);
                  const photo = firstPhotoUrl(photos);

                  return (
                    <div
                      key={b.id}
                      className="rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-16 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-semibold text-slate-900 truncate">
                              {p?.title ?? "Place"}
                            </div>
                            <StatusChip b={b} />
                          </div>

                          <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                            {p?.address ?? "Adresse non renseignée"}
                          </div>

                          <div className="mt-2 text-sm text-slate-700">
                            <span className="text-slate-500">Fin :</span>{" "}
                            <b>{formatDateTime(b.end_time)}</b>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 justify-between sm:justify-end">
                        <div className="text-sm text-slate-700">
                          <div className="text-slate-500 text-xs">Total</div>
                          <div className="font-semibold">
                            {money(b.total_price, b.currency)}
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`${UI.btnBase} ${UI.btnGhost}`}
                          onClick={() => {
                            setCancelMsg(null);
                            setOpenBooking(b);
                          }}
                        >
                          Détails
                        </button>

                        <Link
                          href={`/parkings/${b.parking_id}`}
                          className={`${UI.btnBase} ${UI.btnPrimary}`}
                        >
                          Voir la place
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {past.length === 0 ? (
                <p className={UI.p}>Aucune réservation passée.</p>
              ) : null}
            </section>
          </div>
        )}

        {/* MODALE DETAILS */}
        {openBooking ? (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpenBooking(null)}
          >
            <div
              className={`${UI.card} ${UI.cardPad} w-full max-w-lg space-y-4`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Détails réservation
                  </h2>
                  <p className={UI.subtle}>
                    ID : <span className="font-mono">{openBooking.id}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className={`${UI.btnBase} ${UI.btnGhost}`}
                  onClick={() => setOpenBooking(null)}
                >
                  Fermer
                </button>
              </div>

              {(() => {
                const p = getParkingFromJoin(openBooking.parkings);
                const photos = parsePhotos(p?.photos ?? null);
                const photo = firstPhotoUrl(photos);

                const policy = refundPolicyLabel(openBooking.start_time);

                return (
                  <div className="space-y-3">
                    {photo ? (
                      <div className="h-44 rounded-2xl overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        {p?.title ?? "Place"}
                      </div>
                      <StatusChip b={openBooking} />
                    </div>

                    <div className="text-sm text-slate-700">
                      <div className="text-slate-500 text-xs">Adresse</div>
                      <div>{p?.address ?? "—"}</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
                      <div>
                        <div className="text-slate-500 text-xs">Début</div>
                        <div className="font-medium">
                          {formatDateTime(openBooking.start_time)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs">Fin</div>
                        <div className="font-medium">
                          {formatDateTime(openBooking.end_time)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Total</span>
                      <b className="text-slate-900">
                        {money(openBooking.total_price, openBooking.currency)}
                      </b>
                    </div>

                    {/* ✅ UI Remboursable / Non remboursable AVANT annuler */}
                    <div
                      className={`rounded-2xl border p-3 text-sm ${
                        policy.refundable
                          ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                          : "border-amber-200 bg-amber-50/60 text-amber-800"
                      }`}
                    >
                      <div className="font-semibold">{policy.title}</div>
                      <div className="text-xs mt-1 opacity-90">{policy.detail}</div>
                    </div>

                    {cancelMsg ? (
                      <p className="text-sm text-rose-700">{cancelMsg}</p>
                    ) : null}

                    <div className="flex gap-2 pt-2">
                      <Link
                        href={`/parkings/${openBooking.parking_id}`}
                        className={`${UI.btnBase} ${UI.btnPrimary} flex-1`}
                        onClick={() => setOpenBooking(null)}
                      >
                        Ouvrir la place
                      </Link>

                      {/* ✅ Remplacement EXACT de "Copier ID" -> "Annuler" */}
                      <button
                        type="button"
                        className={`${UI.btnBase} ${UI.btnDanger} flex-1`}
                        disabled={
                          cancelLoading ||
                          (openBooking.status ?? "").toLowerCase() === "cancelled"
                        }
                        onClick={() =>
                          cancelBooking(openBooking.id, openBooking.start_time)
                        }
                        title={
                          (openBooking.status ?? "").toLowerCase() === "cancelled"
                            ? "Déjà annulée"
                            : ""
                        }
                      >
                        {cancelLoading ? "Annulation…" : "Annuler"}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
