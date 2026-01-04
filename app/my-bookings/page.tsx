"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";

type BookingRow = {
  id: string;
  parking_id: string;
  start_time: string;
  end_time: string;
  total_price: number;
  currency: string | null;
  status: string;
  payment_status: string;
  cancelled_at: string | null;
};

type CancelOk = { ok: true; refunded?: boolean; already?: boolean };
type CancelErr = { ok: false; error: string; detail?: string };
type CancelApiResponse = CancelOk | CancelErr;

const REFUND_CUTOFF_HOURS = 12;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}
function hoursToMs(h: number) {
  return h * 60 * 60 * 1000;
}

function refundDecisionClient(b: BookingRow) {
  if (b.payment_status !== "paid") {
    return {
      badge: "Non payé",
      tone: "info" as const,
      title: "Annuler la réservation",
      summaryTitle: "Aucun paiement détecté",
      summaryText: "Tu peux annuler. Aucun remboursement (paiement non effectué).",
      confirmLabel: "Annuler",
      danger: true,
      details: [
        `Début : ${formatDateTime(b.start_time)}`,
        `Fin : ${formatDateTime(b.end_time)}`,
        `Prix : ${b.total_price} ${b.currency ?? "CHF"}`,
        `Paiement : ${b.payment_status}`,
      ],
    };
  }

  const startMs = new Date(b.start_time).getTime();
  const nowMs = Date.now();
  const cutoffMs = startMs - hoursToMs(REFUND_CUTOFF_HOURS);
  const refundable = nowMs <= cutoffMs;

  if (refundable) {
    return {
      badge: "Remboursable ✅",
      tone: "success" as const,
      title: "Annulation remboursable",
      summaryTitle: "Remboursement automatique",
      summaryText: `Si tu annules maintenant : remboursement de ${b.total_price} ${
        b.currency ?? "CHF"
      }.`,
      confirmLabel: "Annuler et rembourser",
      danger: true,
      details: [
        `Début : ${formatDateTime(b.start_time)}`,
        `Fin : ${formatDateTime(b.end_time)}`,
        `Prix : ${b.total_price} ${b.currency ?? "CHF"}`,
        `Paiement : ${b.payment_status}`,
        "",
        `Gratuit jusqu’au ${formatDateTime(new Date(cutoffMs).toISOString())}.`,
      ],
    };
  }

  return {
    badge: "Non remboursable ❌",
    tone: "danger" as const,
    title: "Annulation non remboursable",
    summaryTitle: "Aucun remboursement",
    summaryText: `Moins de ${REFUND_CUTOFF_HOURS}h avant le début : aucun remboursement.`,
    confirmLabel: "Annuler (sans remboursement)",
    danger: true,
    details: [
      `Début : ${formatDateTime(b.start_time)}`,
      `Fin : ${formatDateTime(b.end_time)}`,
      `Prix : ${b.total_price} ${b.currency ?? "CHF"}`,
      `Paiement : ${b.payment_status}`,
    ],
  };
}

export default function MyBookingsPage() {
  const { ready, session, supabase } = useAuth();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalLines, setModalLines] = useState<string[]>([]);
  const [modalConfirmLabel, setModalConfirmLabel] = useState("Confirmer");
  const [modalDanger, setModalDanger] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<BookingRow | null>(null);

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
      .select(
        "id,parking_id,start_time,end_time,total_price,currency,status,payment_status,cancelled_at"
      )
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
  }, [ready, session?.user?.id]);

  const openCancelModal = (b: BookingRow) => {
    const d = refundDecisionClient(b);

    setPendingCancel(b);
    setModalTitle(d.title);
    setModalConfirmLabel(d.confirmLabel);
    setModalDanger(d.danger);
    setModalLines(d.details);

    setModalSummary({
      badge: d.badge,
      title: d.summaryTitle,
      text: d.summaryText,
    });
    setModalTone(d.tone);

    setModalOpen(true);
  };

  const doCancel = async () => {
    if (!session || !pendingCancel) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/bookings/cancel", {
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

  const email = session?.user?.email ?? "—";

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <ConfirmModal
        open={modalOpen}
        title={modalTitle}
        lines={modalLines}
        summary={modalSummary}
        summaryTone={modalTone}
        confirmLabel={modalConfirmLabel}
        cancelLabel="Retour"
        danger={modalDanger}
        loading={loading}
        onClose={() => {
          if (loading) return;
          setModalOpen(false);
          setPendingCancel(null);
        }}
        onConfirm={doCancel}
      />

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mes réservations</h1>
          <p className="text-sm text-gray-600">
            Compte : <b>{ready ? email : "chargement…"}</b>
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/parkings" className={UI.btnGhost}>
            Parkings
          </Link>
          <button className={UI.btnGhost} onClick={load} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </button>
        </div>
      </header>

      {!session && ready && (
        <div className="border rounded p-4 text-sm">
          <p className="text-gray-700">Connecte-toi pour voir tes réservations.</p>
          <Link className="underline" href="/login">
            Se connecter →
          </Link>
        </div>
      )}

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

      <section className="space-y-3">
        {session && rows.length === 0 && !loading && (
          <p className="text-sm text-gray-600">Aucune réservation.</p>
        )}

        {rows.map((b) => {
          const isCancelled = b.status === "cancelled";
          const d = refundDecisionClient(b);

          return (
            <div key={b.id} className={UI.card}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-gray-600">
                  <Link className="underline" href={`/parkings/${b.parking_id}`}>
                    Voir la place →
                  </Link>
                </div>

                <div className="text-xs text-gray-600">
                  Statut : <b>{b.status}</b> · Paiement : <b>{b.payment_status}</b>
                </div>
              </div>

              <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Début :</span>{" "}
                  <b>{formatDateTime(b.start_time)}</b>
                </div>
                <div>
                  <span className="text-gray-600">Fin :</span>{" "}
                  <b>{formatDateTime(b.end_time)}</b>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="text-gray-600">Prix :</span>{" "}
                  <b>
                    {b.total_price} {b.currency ?? "CHF"}
                  </b>
                </div>

                <span className={UI.chip}>{d.badge}</span>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  className={UI.btnGhost}
                  disabled={loading || isCancelled}
                  onClick={() => openCancelModal(b)}
                >
                  {isCancelled ? "Annulée" : "Annuler"}
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
