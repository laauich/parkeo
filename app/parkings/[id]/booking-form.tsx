"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Props = {
  parkingId: string;
  parkingTitle: string;
  priceHour: number;
  priceDay: number | null;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computePriceChf(
  startISO: string,
  endISO: string,
  priceHour: number,
  priceDay: number | null
) {
  const s = Date.parse(startISO);
  const e = Date.parse(endISO);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;

  const ms = e - s;
  const hours = ms / (1000 * 60 * 60);
  const days = ms / (1000 * 60 * 60 * 24);

  // MVP simple :
  // - si priceDay existe et durée >= 24h, on facture par jour (arrondi au jour supérieur)
  // - sinon par heure (arrondi au 1/4 d’heure supérieur)
  if (priceDay && days >= 1) {
    const dayCount = Math.ceil(days);
    return round2(dayCount * priceDay);
  }

  const quarterHours = Math.ceil(hours * 4) / 4;
  return round2(quarterHours * priceHour);
}

type CreateBookingResponse =
  | { bookingId: string; booking?: { id: string } }
  | { error: string; detail?: string };

type CheckoutResponse =
  | { url: string }
  | { error: string; detail?: string };

export default function BookingForm({
  parkingId,
  parkingTitle,
  priceHour,
  priceDay,
}: Props) {
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const amountChf = useMemo(() => {
    if (!start || !end) return 0;
    // datetime-local -> Date.parse ok (interpreted local), on envoie tel quel à l’API qui convertit
    return computePriceChf(start, end, priceHour, priceDay);
  }, [start, end, priceHour, priceDay]);

  const onPayAndBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!start || !end) {
      setError("Choisis une date de début et de fin.");
      return;
    }
    if (amountChf <= 0) {
      setError("Dates invalides (la fin doit être après le début).");
      return;
    }

    setLoading(true);

    try {
      const supabase = supabaseBrowser();

      // 0) session + token
      const { data: sData, error: sErr } = await supabase.auth.getSession();
      const token = sData.session?.access_token;

      if (sErr || !token) {
        setLoading(false);
        setError("Tu dois être connecté pour réserver.");
        return;
      }

      // 1) create booking (server)
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
          currency: "CHF",
        }),
      });

      const j1 = (await r1.json().catch(() => ({}))) as CreateBookingResponse;

      if (!r1.ok) {
        setLoading(false);
        setError("error" in j1 ? j1.error : `Erreur réservation (${r1.status})`);
        return;
      }

      const bookingId =
        "bookingId" in j1 ? j1.bookingId : undefined;

      if (!bookingId) {
        setLoading(false);
        setError(`Réservation créée mais bookingId manquant (status ${r1.status}).`);
        return;
      }

      // 2) create Stripe checkout
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

      const j2 = (await r2.json().catch(() => ({}))) as CheckoutResponse;

      if (!r2.ok) {
        setLoading(false);
        setError("error" in j2 ? j2.error : `Erreur paiement (${r2.status})`);
        return;
      }

      if (!("url" in j2) || !j2.url) {
        setLoading(false);
        setError("Stripe: URL manquante.");
        return;
      }

      // 3) redirect Stripe
      window.location.assign(j2.url);
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  return (
    <form onSubmit={onPayAndBook} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Début
          <input
            className="mt-1 w-full border rounded px-3 py-2"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={loading}
          />
        </label>

        <label className="text-sm">
          Fin
          <input
            className="mt-1 w-full border rounded px-3 py-2"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={loading}
          />
        </label>
      </div>

      <div className="text-sm text-gray-700">
        Prix estimé : <b>{amountChf.toFixed(2)} CHF</b>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="border rounded px-4 py-2"
      >
        {loading ? "Redirection vers paiement..." : "Payer et réserver"}
      </button>

      {error && <p className="text-red-600 text-sm">Erreur : {error}</p>}

      <p className="text-xs text-gray-500">
        Le paiement confirme automatiquement la réservation.
      </p>
    </form>
  );
}
