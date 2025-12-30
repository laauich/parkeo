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

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
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
      // ✅ Récupérer access token
      const { data: sData, error: sErr } = await supabase.auth.getSession();
      const accessToken = sData.session?.access_token;

      if (sErr || !accessToken) {
        setLoading(false);
        setError("Session invalide (token manquant). Reconnecte-toi.");
        return;
      }

      // 1) créer booking côté serveur (bypass RLS)
      const r1 = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkingId,
          start,
          end,
          totalPrice: amountChf,
          accessToken,
        }),
      });

      const j1 = await r1.json().catch(() => ({}));

      if (!r1.ok || !j1.bookingId) {
        setLoading(false);
        setError(j1.error ?? `Erreur create booking (${r1.status})`);
        return;
      }

      const bookingId = j1.bookingId as string;

      // 2) créer checkout stripe
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

      const j2 = await r2.json().catch(() => ({}));

      setLoading(false);

      if (!r2.ok || !j2.url) {
        setError(j2.error ?? `Erreur Stripe checkout (${r2.status})`);
        return;
      }

      // 3) redirection vers Stripe
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
