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

  type BookingResponse = {
    bookingId?: string;
    error?: string;
    detail?: string;
  };

  type StripeResponse = {
    url?: string;
    error?: string;
  };

  const amountChf = useMemo(() => {
    if (!start || !end) return 0;
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
    const hours = (e - s) / (1000 * 60 * 60);
    return Math.max(0, Math.round(hours * priceHour * 100) / 100);
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
      // ✅ Token fiable : récupéré directement depuis Supabase
      const { data: sData, error: sErr } = await supabase.auth.getSession();
      const token = sData.session?.access_token;

      if (sErr || !token) {
        setLoading(false);
        setError("Token manquant. Déconnecte-toi / reconnecte-toi puis réessaie.");
        return;
      }

      // 1) Créer booking côté serveur
      const r1 = await fetch("/api/bookings/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          parkingId,
          start,
          end,
          totalPrice: amountChf,
        }),
      });

      const j1 = await r1.json().catch(() => ({} as BookingResponse));

      if (!r1.ok || !j1.bookingId) {
        setLoading(false);
        const msg =
          j1?.detail ? `${j1.error} — ${j1.detail}` : (j1.error ?? `Erreur create booking (${r1.status})`);
        setError(msg);
        return;
      }

      const bookingId = j1.bookingId as string;

      // 2) Stripe checkout
      const r2 = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          parkingTitle,
          amountChf,
          currency: "chf",
        }),
      });

      const j2 = await r2.json().catch(() => ({} as StripeResponse));

      setLoading(false);

      if (!r2.ok || !j2.url) {
        setError(j2.error ?? `Erreur Stripe checkout (${r2.status})`);
        return;
      }

      window.location.assign(j2.url);
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
