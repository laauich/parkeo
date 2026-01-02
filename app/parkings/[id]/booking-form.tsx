"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type Props = {
  parkingId: string;
  priceHour: number;
  priceDay: number | null;
  parkingTitle?: string;
};

export default function BookingForm({
  parkingId,
  priceHour,
  priceDay,
  parkingTitle,
}: Props) {
  const { ready, session, supabase } = useAuth();

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 💰 Calcul du prix
  const amountChf = useMemo(() => {
    if (!start || !end) return 0;

    const s = new Date(start).getTime();
    const e = new Date(end).getTime();

    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;

    const hours = Math.ceil((e - s) / (1000 * 60 * 60));

    if (priceDay && hours >= 24) {
      const days = Math.ceil(hours / 24);
      return days * priceDay;
    }

    return hours * priceHour;
  }, [start, end, priceHour, priceDay]);

  const canSubmit =
    ready &&
    session &&
    !!start &&
    !!end &&
    amountChf > 0 &&
    !loading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ready) return;
    if (!session) {
      setError("Tu dois être connecté pour réserver.");
      return;
    }
    if (!canSubmit) return;

    setLoading(true);

    try {
      // 1) Créer le booking
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Session invalide");

      const res = await fetch("/api/bookings/create", {
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
          currency: "CHF",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? "Erreur création réservation");
      }

      const bookingId = json.bookingId;

      // 2) Stripe checkout
      const payRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          parkingTitle,
          amountChf,
          currency: "chf",
        }),
      });

      const payJson = await payRes.json();

      if (!payRes.ok || !payJson?.url) {
        throw new Error(payJson?.error ?? "Erreur Stripe Checkout");
      }

      // 3) Redirection Stripe
      window.location.href = payJson.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* DATE DE DÉBUT */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Début (date & heure)
        </label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="border rounded px-3 py-3 w-full text-base"
        />
      </div>

      {/* DATE DE FIN */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Fin (date & heure)
        </label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="border rounded px-3 py-3 w-full text-base"
        />
      </div>

      {/* PRIX */}
      <div className="text-sm">
        <span className="font-medium">Prix estimé :</span>{" "}
        <b>{amountChf > 0 ? `${amountChf} CHF` : "—"}</b>
      </div>

      {/* ERREUR */}
      {error && (
        <p className="text-sm text-red-600">
          Erreur : {error}
        </p>
      )}

      {/* BOUTON */}
      <button
        type="submit"
        className={UI.btnPrimary}
        disabled={!canSubmit}
      >
        {loading ? "Redirection vers le paiement…" : "Payer et réserver"}
      </button>

      <p className="text-xs text-gray-500">
        Le paiement confirme automatiquement la réservation.
      </p>
    </form>
  );
}
