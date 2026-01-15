// app/my-parkings/[id]/bookings/bookings-client.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";

type BookingRow = {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  total_price: number;
  currency: string | null;
  status: string;
  payment_status: string;
};

type CancelOk = { ok: true; refunded?: boolean; already?: boolean };
type CancelErr = { ok: false; error: string; detail?: string };
type CancelApiResponse = CancelOk | CancelErr;

type EnsureChatOk = { ok: true; conversationId: string };
type EnsureChatErr = { ok: false; error: string };
type EnsureChatResponse = EnsureChatOk | EnsureChatErr;

type ParkingJoin = {
  id: string;
  title: string | null;
  address: string | null;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  photos: string[] | string | null; // support array OR json string
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
  return u || null;
}

function StatusChip({ b }: { b: BookingRow }) {
  const s = (b.status ?? "").toLowerCase();
  const pay = (b.payment_status ?? "").toLowerCase();

  if (s === "confirmed" && pay === "paid") {
    return (
      <span className={`${UI.chip} bg-emerald-50 border-emerald-200 text-emerald-700`}>
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

/**
 * Modalités pour owner (comme côté client -> popup #2):
 * - si payé => remboursement
 * - sinon => simple annulation
 */
function ownerSummary(b: BookingRow) {
  const pay = (b.payment_status ?? "").toLowerCase();
  if (pay === "paid") {
    return {
      badge: "Remboursement ✅",
      tone: "warning" as const,
      title: "Le client sera remboursé",
      text: `Annulation propriétaire : remboursement automatique de ${money(
        b.total_price,
        b.currency
      )}.`,
    };
  }
  return {
    badge: "Non payé",
    tone: "info" as const,
    title: "Réservation non payée",
    text: "Annulation simple (pas de remboursement).",
  };
}

export default function BookingsClient({ parkingId }: { parkingId: string }) {
  const { ready, session, supabase } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // infos parking (photo, titre, adresse) pour faire les cards comme côté client
  const [parking, setParking] = useState<ParkingJoin | null>(null);

  // chat state
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);

  // popup #1: détails
  const [openBooking, setOpenBooking] = useState<BookingRow | null>(null);

  // popup #2: confirm annulation + modalités
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<BookingRow | null>(null);
  const [confirmLines, setConfirmLines] = useState<string[]>([]);
  const [confirmSummaryState, setConfirmSummaryState] = useState<
    { badge?: string; title?: string; text?: string } | undefined
  >(undefined);
  const [confirmTone, setConfirmTone] = useState<"success" | "warning" | "danger" | "info">("info");

  const loadParking = async () => {
    if (!ready) return;

    const { data, error } = await supabase
      .from("parkings")
      .select("id,title,address,street,street_number,postal_code,city,photos")
      .eq("id", parkingId)
      .maybeSingle();

    if (!error) setParking((data ?? null) as ParkingJoin | null);
  };

  const load = async () => {
    if (!ready) return;

    if (!session) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("bookings")
      .select("id,user_id,start_time,end_time,total_price,currency,status,payment_status")
      .eq("parking_id", parkingId)
      .order("start_time", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as BookingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    queueMicrotask(() => void load());
    queueMicrotask(() => void loadParking());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  // évite Date.now() dans render
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const upcoming = useMemo(
    () =>
      rows.filter(
        (b) =>
          new Date(b.end_time).getTime() > nowMs &&
          (b.status ?? "").toLowerCase() !== "cancelled"
      ),
    [rows, nowMs]
  );

  const past = useMemo(
    () =>
      rows.filter(
        (b) =>
          new Date(b.end_time).getTime() <= nowMs ||
          (b.status ?? "").toLowerCase() === "cancelled"
      ),
    [rows, nowMs]
  );

  const openChat = async (bookingId: string) => {
    if (!session) return;

    setChatLoadingId(bookingId);
    setError(null);

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
        const msg = ("error" in json && json.error) || `Erreur chat (${res.status})`;
        setError(msg);
        setChatLoadingId(null);
        return;
      }

      router.push(`/messages/${json.conversationId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue (chat)");
    } finally {
      setChatLoadingId(null);
    }
  };

  // ouvre le popup #2 (modalités + confirmation)
  const openOwnerCancelConfirm = (b: BookingRow) => {
    const s = ownerSummary(b);

    setPendingCancel(b);
    setConfirmSummaryState({ badge: s.badge, title: s.title, text: s.text });
    setConfirmTone(s.tone);

    setConfirmLines([
      `Début : ${formatDateTime(b.start_time)}`,
      `Fin : ${formatDateTime(b.end_time)}`,
      `Montant : ${money(b.total_price, b.currency)}`,
      `Paiement : ${b.payment_status}`,
      "",
      "Confirmer l’annulation ?",
    ]);

    setConfirmOpen(true);
  };

  const doCancelOwner = async () => {
    if (!session || !pendingCancel) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/owner/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId: pendingCancel.id }),
      });

      const json = (await res.json().catch(() => ({}))) as CancelApiResponse;

      if (!res.ok || !json.ok) {
        const msg =
          "error" in json
            ? `${json.error}${json.detail ? ` — ${json.detail}` : ""}`
            : `Erreur annulation (${res.status})`;
        setError(msg);
        setLoading(false);
        setConfirmOpen(false);
        setPendingCancel(null);
        return;
      }

      await load();
      setLoading(false);
      setConfirmOpen(false);
      setPendingCancel(null);

      // si on était dans le popup détails, on le ferme
      setOpenBooking((prev) => (prev?.id === pendingCancel.id ? null : prev));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
      setConfirmOpen(false);
      setPendingCancel(null);
    }
  };

  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
    danger: `${UI.btnBase} ${UI.btnDanger}`,
  };

  const Card = `${UI.card} ${UI.cardPad}`;
  const Subtle = UI.subtle;

  const photos = parsePhotos(parking?.photos ?? null);
  const photo = firstPhotoUrl(photos);

  return (
    <div className="space-y-6">
      {/* Popup #2: modalités remboursement + confirmation */}
      <ConfirmModal
        open={confirmOpen}
        title="Annuler (propriétaire)"
        lines={confirmLines}
        summary={confirmSummaryState}
        summaryTone={confirmTone}
        confirmLabel="Confirmer l’annulation"
        cancelLabel="Retour"
        danger
        loading={loading}
        onClose={() => {
          if (loading) return;
          setConfirmOpen(false);
          setPendingCancel(null);
        }}
        onConfirm={doCancelOwner}
      />

      <header className={UI.sectionTitleRow}>
        <div className="space-y-1 min-w-0">
          <h2 className={UI.h2}>Réservations (ma place)</h2>
          <p className={UI.p}>
            {parking?.title ? (
              <b className="text-slate-900">{parking.title}</b>
            ) : (
              <span className="text-slate-700">Parking</span>
            )}
            {parking?.address ? (
              <span className="text-slate-500"> — {parking.address}</span>
            ) : (
              <span className="text-slate-500">
                {" "}
                — <span className="font-mono text-xs">{parkingId}</span>
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/my-parkings" className={Btn.ghost}>
            Mes places
          </Link>

          <Link href="/messages" className={Btn.ghost} title="Voir tous les messages">
            Messages
          </Link>

          <button className={Btn.ghost} onClick={load} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </button>
        </div>
      </header>

      {!session && ready && (
        <div className={Card}>
          <p className={UI.p}>Connecte-toi pour voir les réservations.</p>
          <div className="mt-3">
            <Link className={UI.link} href="/login">
              Se connecter →
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className={`${Card} border-rose-200`}>
          <p className="text-sm text-rose-700">Erreur : {error}</p>
        </div>
      )}

      {/* ✅ À venir (cards comme côté client) */}
      <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className={UI.h2}>À venir</h3>
          <span className={Subtle}>{upcoming.length} réservation(s)</span>
        </div>

        {session && upcoming.length === 0 && !loading ? <p className={UI.p}>Aucune réservation à venir.</p> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((b) => (
            <div key={b.id} className={`${UI.card} ${UI.cardHover} overflow-hidden`}>
              <div className="h-40 bg-slate-100">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="w-full h-full object-cover" />
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
                      {parking?.title ?? "Ma place"}
                    </div>
                    <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                      {parking?.address ?? "Adresse non renseignée"}
                    </div>
                  </div>
                  <StatusChip b={b} />
                </div>

                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <div>
                    <span className="text-slate-500">Début :</span>{" "}
                    <b className="text-slate-900">{formatDateTime(b.start_time)}</b>
                  </div>
                  <div>
                    <span className="text-slate-500">Fin :</span>{" "}
                    <b className="text-slate-900">{formatDateTime(b.end_time)}</b>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <b className="text-slate-900">{money(b.total_price, b.currency)}</b>
                </div>

                <div className={`${UI.divider} my-4`} />

                {/* ✅ 3 boutons EXACTEMENT comme côté client */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Link href={`/parkings/${parkingId}`} className={`${Btn.ghost} w-full sm:flex-1`}>
                    Voir la place
                  </Link>

                  <button
                    type="button"
                    className={`${Btn.primary} w-full sm:flex-1`}
                    disabled={!session || chatLoadingId === b.id}
                    onClick={() => openChat(b.id)}
                    title="Ouvrir la conversation avec le client"
                  >
                    {chatLoadingId === b.id ? "…" : "Chat"}
                  </button>

                  <button
                    type="button"
                    className={`${Btn.primary} w-full sm:flex-1`}
                    onClick={() => setOpenBooking(b)}
                  >
                    Détails
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ✅ Historique */}
      <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className={UI.h2}>Historique</h3>
          <span className={Subtle}>{past.length} réservation(s)</span>
        </div>

        {session && past.length === 0 && !loading ? <p className={UI.p}>Aucun historique.</p> : null}

        <div className="space-y-3">
          {past.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-16 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-slate-900 truncate">
                      {parking?.title ?? "Ma place"}
                    </div>
                    <StatusChip b={b} />
                  </div>

                  <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                    {parking?.address ?? "Adresse non renseignée"}
                  </div>

                  <div className="mt-2 text-sm text-slate-700">
                    <span className="text-slate-500">Fin :</span>{" "}
                    <b className="text-slate-900">{formatDateTime(b.end_time)}</b>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="text-sm text-slate-700 sm:text-right">
                  <div className="text-slate-500 text-xs">Total</div>
                  <div className="font-semibold">{money(b.total_price, b.currency)}</div>
                </div>

                <button
                  type="button"
                  className={`${Btn.primary} w-full sm:w-auto`}
                  disabled={!session || chatLoadingId === b.id}
                  onClick={() => openChat(b.id)}
                >
                  {chatLoadingId === b.id ? "…" : "Chat"}
                </button>

                <button type="button" className={`${Btn.ghost} w-full sm:w-auto`} onClick={() => setOpenBooking(b)}>
                  Détails
                </button>

                <Link href={`/parkings/${parkingId}`} className={`${Btn.ghost} w-full sm:w-auto`}>
                  Voir la place
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Popup #1: détails (avec bouton Annuler qui ouvre popup #2) */}
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
                <h2 className="text-lg font-semibold text-slate-900">Détails réservation</h2>
                <p className={UI.subtle}>
                  ID : <span className="font-mono break-all">{openBooking.id}</span>
                </p>
              </div>

              <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => setOpenBooking(null)}>
                Fermer
              </button>
            </div>

            {photo ? (
              <div className="h-44 rounded-2xl overflow-hidden bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-900 min-w-0 truncate">{parking?.title ?? "Ma place"}</div>
              <StatusChip b={openBooking} />
            </div>

            <div className="text-sm text-slate-700">
              <div className="text-slate-500 text-xs">Adresse</div>
              <div className="break-words">{parking?.address ?? "—"}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
              <div>
                <div className="text-slate-500 text-xs">Début</div>
                <div className="font-medium break-words">{formatDateTime(openBooking.start_time)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Fin</div>
                <div className="font-medium break-words">{formatDateTime(openBooking.end_time)}</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Total</span>
              <b className="text-slate-900">{money(openBooking.total_price, openBooking.currency)}</b>
            </div>

            <div className="text-xs text-slate-500">
              Paiement :{" "}
              <span className="font-medium text-slate-900">{openBooking.payment_status}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Link
                href={`/parkings/${parkingId}`}
                className={`${Btn.ghost} w-full sm:flex-1`}
                onClick={() => setOpenBooking(null)}
              >
                Voir la place
              </Link>

              <button
                type="button"
                className={`${Btn.primary} w-full sm:flex-1`}
                disabled={!session || chatLoadingId === openBooking.id}
                onClick={() => openChat(openBooking.id)}
              >
                {chatLoadingId === openBooking.id ? "…" : "Chat"}
              </button>

              <button
                type="button"
                className={`${Btn.danger} w-full sm:flex-1`}
                disabled={loading || (openBooking.status ?? "").toLowerCase() === "cancelled"}
                onClick={() => openOwnerCancelConfirm(openBooking)}
                title={(openBooking.status ?? "").toLowerCase() === "cancelled" ? "Déjà annulée" : ""}
              >
                Annuler
              </button>
            </div>

            <div className="pt-2 text-xs text-slate-500 border-t border-slate-200/70">
              Remarque : l’annulation propriétaire déclenche un remboursement automatique uniquement si la réservation est
              payée.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
