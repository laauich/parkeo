"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { useRouter } from "next/navigation";

export default function BookingForm({
  parkingId,
  parkingTitle,
  priceHour,
}: {
  parkingId: string;
  parkingTitle: string;
  priceHour: number;
}) {
  const { supabase, ready, session } = useAuth();
  const router = useRouter();

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountChf = useMemo(() => {
    if (!start || !end) return 0;

    const s = new Date(start).getTime();
    const e = new Date(end).getTime();

    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;

    const hours = (e - s) / (1000 * 60 * 60);
    const total = hours * priceHour;

    return Math.max(0, Math.round(total * 100) / 100);
  }, [start, end, priceHour]);

  const onPayAndBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ready) return;

    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(`/parkings/${parkingId}`)}`);
      return;
    }

    if (!start || !end) {
      setError("Choisis une date de début et une date de fin.");
      return;
    }

    if (amountChf <= 0) {
      setError("Dates invalides (fin doit être après début).");
      return;
    }

    setLoading(true);

    // 1) Créer une réservation en pending/unpaid
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .insert({
        parking_id: parkingId,
        start_time: start,
        end_time: end,
        total_price: amountChf,
        status: "pending",
        payment_status: "unpaid",
      })
      .select("id")
      .single();

    if (bErr || !booking) {
      setLoading(false);
      setError(bErr?.message ?? "Erreur lors de la création de la réservation.");
      return;
    }

    // 2) Demander à ton backend de créer une session Stripe Checkout
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: booking.id,
        parkingTitle,
        amountChf,
        currency: "chf",
      }),
    });

    const json = await res.json();

    setLoading(false);

    if (!res.ok || !json.url) {
      setError(json.error ?? "Erreur Stripe Checkout.");
      return;
    }

    // 3) Redirection vers Stripe
    window.location.href = json.url;
  };

  return (
    <form onSubmit={onPayAndBook} className="mt-4 space-y-3">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-700">Début</label>
        <input
          type="datetime-local"
          className="border rounded p-2"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-700">Fin</label>
        <input
          type="datetime-local"
          className="border rounded p-2"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
        />
      </div>

      <p className="text-sm text-gray-600">
        Total estimé : <b>{amountChf.toFixed(2)} CHF</b>
      </p>

      <button className="border rounded px-4 py-2" disabled={loading}>
        {loading ? "Redirection..." : "Payer et réserver"}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <p className="text-xs text-gray-500">
        Le paiement confirme automatiquement la réservation.
      </p>
    </form>
  );
}
