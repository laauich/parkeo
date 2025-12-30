"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";

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

  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountChf = useMemo(() => {
    if (!start || !end) return 0;

    const s = Date.parse(start);
    const e = Date.parse(end);

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
      setError("Dates invalides (la fin doit être après le début).");
      return;
    }

    setLoading(true);

    try {
      // 1) create booking (pending/unpaid) + user_id pour RLS ✅
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .insert({
          user_id: session.user.id, // ✅ IMPORTANT
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

      // 2) create checkout session
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

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoading(false);
        setError(json?.error ?? `Erreur API checkout (${res.status})`);
        return;
      }

      if (!json?.url) {
        setLoading(false);
        setError("Stripe Checkout: URL manquante.");
        return;
      }

      // 3) redirect to Stripe
      window.location.assign(json.url);
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
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

      {error && <p className="text-red-600 text-sm">Erreur : {error}</p>}
    </form>
  );
}
