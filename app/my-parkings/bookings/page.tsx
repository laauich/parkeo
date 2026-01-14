// app/my-parkings/bookings/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import { useRouter } from "next/navigation";

type ParkingJoin = {
  id: string;
  title: string | null;
  address: string | null;
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
  // join parkings
  parkings?: ParkingJoin[] | ParkingJoin | null;
};

type CancelOk = { ok: true; refunded?: boolean; already?: boolean };
type CancelErr = { ok: false; error: string; detail?: string };
type CancelApiResponse = CancelOk | CancelErr;

type EnsureChatOk = { ok: true; conversationId: string };
type EnsureChatErr = { ok: false; error: string };
type EnsureChatResponse = EnsureChatOk | EnsureChatErr;

function getParkingFromJoin(join: BookingRow["parkings"]): ParkingJoin | null {
  if (!join) return null;
  if (Array.isArray(join)) return join[0] ?? null;
  return join;
}

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

export default function OwnerBookingsGlobalPage() {
  const { ready, session, supabase } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);

  const userId = session?.user?.id ?? null;

  const load = async () => {
    if (!ready) return;

    if (!session || !userId) {
      setRows([]);
      setErr(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    // ⚠️ IMPORTANT :
    // - On affiche TOUTES les réservations (bookings) dont le parking appartient au user (owner).
    // - On fait un join sur parkings pour afficher le titre/adresse.
    // - Il faut que ta table parkings ait bien une colonne owner_id (ou user_id côté owner).
    //
    // Si chez toi la colonne s'appelle "user_id" au lieu de "owner_id",
    // remplace `.eq("parkings.owner_id", userId)` par `.eq("parkings.user_id", userId)`.
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
        parkings:parking_id ( id, title, address, owner_id )
      `
      )
      // filtre par propriétaire via la table join
      .eq("parkings.owner_id", userId)
      .order("start_time", { ascending: false })
      .limit(500);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // Certains setups renvoient parkings comme array même en 1-1
    setRows((data ?? []) as unknown as BookingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows.filter((b) => {
      const startMs = new Date(b.start_time).getTime();
      return startMs > now && (b.status ?? "").toLowerCase() !== "cancelled";
    });
  }, [rows]);

  const past = useMemo(() => {
    const now = Date.now();
    return rows.filter((b) => {
      const startMs = new Date(b.start_time).getTime();
      return startMs <= now || (b.status ?? "").toLowerCase() === "cancelled";
    });
  }, [rows]);

  const openChat = async (bookingId: string) => {
    if (!session) return;

    setChatLoadingId(bookingId);
    setErr(null);

    try {
      const res = await fetch("/api/conversations/ensure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId }),
      });

      const json = (await res.json().catch(() => ({}))) as EnsureChatResponse;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg =
          ("error" in json && json.error) || `Erreur chat (${res.status})`;
        setErr(msg);
        setChatLoadingId(null);
        return;
      }

      router.push(`/messages/${json.conversationId}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue (chat)");
    } finally {
      setChatLoadingId(null);
    }
  };

  const cancelOwner = async (bookingId: string) => {
    if (!session) return;

    if (!window.confirm("Confirmer l’annulation propriétaire ?")) return;

    setCancelLoadingId(bookingId);
    setErr(null);

    try {
      const res = await fetch("/api/owner/bookings/cancel", {
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
          ("error" in json ? json.error : null) ??
          `Erreur annulation (${res.status})`;
        const detail = "detail" in json ? json.detail : undefined;
        setErr(detail ? `${msg} — ${detail}` : msg);
        setCancelLoadingId(null);
        return;
      }

      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue (annulation)");
    } finally {
      setCancelLoadingId(null);
    }
  };

  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
    danger: `${UI.btnBase} ${UI.btnDanger}`,
  };

  const Card = `${UI.card} ${UI.cardPad}`;

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
            <h1 className={UI.h1}>Réservations (mes places)</h1>
            <p className={UI.p}>Connecte-toi pour voir les réservations.</p>
            <Link href="/login" className={Btn.primary}>
              Se connecter
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>Réservations (mes places)</h1>
            <p className={UI.p}>
              Toutes les réservations sur toutes tes places.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={Btn.ghost}>
              Mes places
            </Link>
            <button className={Btn.ghost} onClick={() => void load()} disabled={loading}>
              {loading ? "…" : "Rafraîchir"}
            </button>
          </div>
        </header>

        {err ? (
          <div className={`${Card} border-rose-200`}>
            <p className="text-sm text-rose-700">Erreur : {err}</p>
          </div>
        ) : null}

        {loading ? (
          <div className={Card}>
            <p className={UI.p}>Chargement…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className={Card}>
            <p className={UI.p}>Aucune réservation pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* À venir */}
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <h2 className={UI.h2}>À venir</h2>
                <span className={UI.subtle}>{upcoming.length} réservation(s)</span>
              </div>

              {upcoming.length === 0 ? (
                <div className={Card}>
                  <p className={UI.p}>Aucune réservation à venir.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {upcoming.map((b) => {
                    const p = getParkingFromJoin(b.parkings);
                    return (
                      <div key={b.id} className={Card}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="font-semibold text-slate-900 truncate">
                              {p?.title ?? "Parking"}
                            </div>
                            <div className="text-xs text-slate-600 truncate">
                              {p?.address ?? "—"}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              booking: {b.id}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={UI.chip}>Statut: {b.status ?? "—"}</span>
                            <span className={UI.chip}>Paiement: {b.payment_status ?? "—"}</span>
                          </div>
                        </div>

                        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm text-slate-700">
                          <div>
                            <span className="text-slate-500">Début :</span>{" "}
                            <b className="text-slate-900">{formatDateTime(b.start_time)}</b>
                          </div>
                          <div>
                            <span className="text-slate-500">Fin :</span>{" "}
                            <b className="text-slate-900">{formatDateTime(b.end_time)}</b>
                          </div>
                        </div>

                        <div className="mt-2 text-sm text-slate-700 flex items-center justify-between">
                          <span className="text-slate-500">Total</span>
                          <b className="text-slate-900">{money(b.total_price, b.currency)}</b>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/my-parkings/${b.parking_id}/bookings`}
                            className={Btn.ghost}
                            title="Ouvrir la page réservations de cette place"
                          >
                            Voir la place →
                          </Link>

                          <button
                            type="button"
                            className={Btn.primary}
                            disabled={chatLoadingId === b.id}
                            onClick={() => void openChat(b.id)}
                          >
                            {chatLoadingId === b.id ? "…" : "💬 Chat"}
                          </button>

                          <button
                            type="button"
                            className={Btn.danger}
                            disabled={cancelLoadingId === b.id}
                            onClick={() => void cancelOwner(b.id)}
                          >
                            {cancelLoadingId === b.id ? "Annulation…" : "Annuler"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Historique */}
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <h2 className={UI.h2}>Historique</h2>
                <span className={UI.subtle}>{past.length} réservation(s)</span>
              </div>

              {past.length === 0 ? (
                <div className={Card}>
                  <p className={UI.p}>Aucun historique.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {past.map((b) => {
                    const p = getParkingFromJoin(b.parkings);
                    return (
                      <div key={b.id} className={Card}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="font-semibold text-slate-900 truncate">
                              {p?.title ?? "Parking"}
                            </div>
                            <div className="text-xs text-slate-600 truncate">
                              {p?.address ?? "—"}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              booking: {b.id}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={UI.chip}>{b.status ?? "—"}</span>
                            <span className={UI.chip}>{b.payment_status ?? "—"}</span>
                          </div>
                        </div>

                        <div className="mt-3 text-sm text-slate-700">
                          <b className="text-slate-900">{formatDateTime(b.start_time)}</b>{" "}
                          <span className="text-slate-400">→</span>{" "}
                          <b className="text-slate-900">{formatDateTime(b.end_time)}</b>
                        </div>

                        <div className="mt-2 text-sm text-slate-700 flex items-center justify-between">
                          <span className="text-slate-500">Total</span>
                          <b className="text-slate-900">{money(b.total_price, b.currency)}</b>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/my-parkings/${b.parking_id}/bookings`}
                            className={Btn.ghost}
                          >
                            Voir la place →
                          </Link>

                          <button
                            type="button"
                            className={Btn.primary}
                            disabled={chatLoadingId === b.id}
                            onClick={() => void openChat(b.id)}
                          >
                            {chatLoadingId === b.id ? "…" : "💬 Chat"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
