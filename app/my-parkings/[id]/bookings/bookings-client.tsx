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

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ownerSummary(b: BookingRow) {
  if (b.payment_status === "paid") {
    return {
      badge: "Remboursement ✅",
      tone: "warning" as const,
      title: "Le client sera remboursé",
      text: `Annulation propriétaire : remboursement automatique de ${b.total_price} ${
        b.currency ?? "CHF"
      }.`,
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

  // Chat state
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<BookingRow | null>(null);
  const [modalLines, setModalLines] = useState<string[]>([]);
  const [modalSummary, setModalSummary] = useState<
    { badge?: string; title?: string; text?: string } | undefined
  >(undefined);
  const [modalTone, setModalTone] = useState<
    "success" | "warning" | "danger" | "info"
  >("info");

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
      .select(
        "id,user_id,start_time,end_time,total_price,currency,status,payment_status"
      )
      .eq("parking_id", parkingId)
      .order("start_time", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as BookingRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  const openOwnerCancelModal = (b: BookingRow) => {
    const s = ownerSummary(b);

    setPendingCancel(b);
    setModalSummary({ badge: s.badge, title: s.title, text: s.text });
    setModalTone(s.tone);

    setModalLines([
      `Début : ${formatDateTime(b.start_time)}`,
      `Fin : ${formatDateTime(b.end_time)}`,
      `Prix : ${b.total_price} ${b.currency ?? "CHF"}`,
      `Paiement : ${b.payment_status}`,
      "",
      "Confirmer l’annulation ?",
    ]);

    setModalOpen(true);
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
        setModalOpen(false);
        setPendingCancel(null);
        return;
      }

      await load();
      setLoading(false);
      setModalOpen(false);
      setPendingCancel(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
      setModalOpen(false);
      setPendingCancel(null);
    }
  };

  // ✅ éviter Date.now() dans render (purity)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const upcoming = useMemo(
    () =>
      rows.filter(
        (b) =>
          new Date(b.start_time).getTime() > nowMs && b.status !== "cancelled"
      ),
    [rows, nowMs]
  );

  const past = useMemo(
    () =>
      rows.filter(
        (b) =>
          new Date(b.start_time).getTime() <= nowMs || b.status === "cancelled"
      ),
    [rows, nowMs]
  );

  // ✅ Ouvrir / Créer le chat pour une réservation
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
        const msg =
          ("error" in json && json.error) || `Erreur chat (${res.status})`;
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

  // UI helpers (uniformiser sans toucher à ta base)
  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
    danger: `${UI.btnBase} ${UI.btnDanger}`,
  };

  const Card = `${UI.card} ${UI.cardPad}`;
  const Subtle = UI.subtle;

  return (
    <div className="space-y-6">
      <ConfirmModal
        open={modalOpen}
        title="Annuler (propriétaire)"
        lines={modalLines}
        summary={modalSummary}
        summaryTone={modalTone}
        confirmLabel="Confirmer l’annulation"
        cancelLabel="Retour"
        danger
        loading={loading}
        onClose={() => {
          if (loading) return;
          setModalOpen(false);
          setPendingCancel(null);
        }}
        onConfirm={doCancelOwner}
      />

      <header className={UI.sectionTitleRow}>
        <div className="space-y-1">
          <h2 className={UI.h2}>Réservations (ma place)</h2>
          <p className={UI.p}>
            Parking :{" "}
            <span className="font-mono text-xs text-slate-700">{parkingId}</span>
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

      {/* À venir */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">À venir</h3>
          <span className={Subtle}>{upcoming.length} réservation(s)</span>
        </div>

        {session && upcoming.length === 0 && !loading && (
          <div className={Card}>
            <p className={UI.p}>Aucune réservation à venir.</p>
          </div>
        )}

        {upcoming.map((b) => (
          <div key={b.id} className={Card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-mono text-slate-500">{b.id}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={UI.chip}>Statut: {b.status}</span>
                <span className={UI.chip}>Paiement: {b.payment_status}</span>
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

            <div className="mt-2 text-sm text-slate-700">
              <span className="text-slate-500">Prix :</span>{" "}
              <b className="text-slate-900">
                {b.total_price} {b.currency ?? "CHF"}
              </b>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={Btn.primary}
                disabled={!session || chatLoadingId === b.id}
                onClick={() => openChat(b.id)}
                title="Ouvrir le chat avec le client"
              >
                {chatLoadingId === b.id ? "…" : "💬 Chat"}
              </button>

              <button
                type="button"
                className={Btn.danger}
                disabled={loading}
                onClick={() => openOwnerCancelModal(b)}
              >
                Annuler (propriétaire)
              </button>
            </div>

            <div className="mt-4 border-t border-slate-200/70 pt-3 text-xs text-slate-500">
              Remarque : l’annulation propriétaire déclenche un remboursement
              automatique uniquement si la réservation est payée.
            </div>
          </div>
        ))}
      </section>

      {/* Historique */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">Historique</h3>
          <span className={Subtle}>{past.length} réservation(s)</span>
        </div>

        {session && past.length === 0 && !loading && (
          <div className={Card}>
            <p className={UI.p}>Aucun historique.</p>
          </div>
        )}

        {past.map((b) => (
          <div key={b.id} className={Card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-mono text-slate-500">{b.id}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={UI.chip}>{b.status}</span>
                <span className={UI.chip}>{b.payment_status}</span>
              </div>
            </div>

            <div className="mt-3 text-sm text-slate-700">
              <b className="text-slate-900">{formatDateTime(b.start_time)}</b>{" "}
              <span className="text-slate-400">→</span>{" "}
              <b className="text-slate-900">{formatDateTime(b.end_time)}</b>
            </div>

            <div className="mt-2 text-sm text-slate-700">
              <span className="text-slate-500">Montant :</span>{" "}
              <b className="text-slate-900">
                {b.total_price} {b.currency ?? "CHF"}
              </b>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                className={Btn.primary}
                disabled={!session || chatLoadingId === b.id}
                onClick={() => openChat(b.id)}
                title="Ouvrir le chat avec le client"
              >
                {chatLoadingId === b.id ? "…" : "💬 Chat"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
