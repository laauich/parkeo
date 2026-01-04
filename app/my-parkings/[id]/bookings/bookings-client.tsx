"use client";

import Link from "next/link";
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
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

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<BookingRow | null>(null);
  const [modalLines, setModalLines] = useState<string[]>([]);
  const [modalSummary, setModalSummary] = useState<
    { badge?: string; title?: string; text?: string } | undefined
  >(undefined);
  const [modalTone, setModalTone] = useState<"success" | "warning" | "danger" | "info">("info");

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

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
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

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Réservations (ma place)</h1>
          <p className="text-sm text-gray-600">
            Parking : <span className="font-mono text-xs">{parkingId}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/my-parkings" className={UI.btnGhost}>
            Mes places
          </Link>
          <button className={UI.btnGhost} onClick={load} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </button>
        </div>
      </header>

      {!session && ready && (
        <div className="border rounded p-4 text-sm">
          <p className="text-gray-700">Connecte-toi pour voir les réservations.</p>
          <Link className="underline" href="/login">
            Se connecter →
          </Link>
        </div>
      )}

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

      <section className="space-y-3">
        <h2 className="font-semibold">À venir</h2>

        {session && upcoming.length === 0 && !loading && (
          <p className="text-sm text-gray-600">Aucune réservation à venir.</p>
        )}

        {upcoming.map((b) => (
          <div key={b.id} className={UI.card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-gray-600 font-mono">{b.id}</div>
              <div className="text-xs text-gray-600">
                Statut : <b>{b.status}</b> · Paiement : <b>{b.payment_status}</b>
              </div>
            </div>

            <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
              <div>Début : <b>{formatDateTime(b.start_time)}</b></div>
              <div>Fin : <b>{formatDateTime(b.end_time)}</b></div>
            </div>

            <div className="mt-2 text-sm">
              Prix : <b>{b.total_price} {b.currency ?? "CHF"}</b>
            </div>

            <div className="mt-3">
              <button
                type="button"
                className={UI.btnGhost}
                disabled={loading}
                onClick={() => openOwnerCancelModal(b)}
              >
                Annuler (propriétaire)
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Historique</h2>

        {session && past.length === 0 && !loading && (
          <p className="text-sm text-gray-600">Aucun historique.</p>
        )}

        {past.map((b) => (
          <div key={b.id} className={UI.card}>
            <div className="text-xs text-gray-600 font-mono">{b.id}</div>
            <div className="mt-1 text-sm">
              {formatDateTime(b.start_time)} → {formatDateTime(b.end_time)}
            </div>
            <div className="mt-1 text-sm text-gray-700">
              {b.total_price} {b.currency ?? "CHF"} · {b.status} · {b.payment_status}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
