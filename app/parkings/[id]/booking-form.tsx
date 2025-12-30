"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function BookingForm({
  parkingId,
  priceHour,
  priceDay,
}: {
  parkingId: string;
  priceHour: number;
  priceDay: number | null;
}) {
  const supabase = supabaseBrowser();

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔐 Vérifier la session
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUserEmail(data.session?.user.email ?? null);
    };
    checkSession();
  }, [supabase]);

  // 💰 Calcul du prix (SANS setState)
  const computedPrice = useMemo(() => {
    if (!start || !end) return null;

    const s = new Date(start);
    const e = new Date(end);

    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    if (e <= s) return null;

    const hours = (e.getTime() - s.getTime()) / (1000 * 60 * 60);

    if (priceDay && hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours - days * 24;
      const total = days * priceDay + remainingHours * priceHour;
      return Math.round(total * 100) / 100;
    }

    const total = hours * priceHour;
    return Math.round(total * 100) / 100;
  }, [start, end, priceHour, priceDay]);

  // 🅿️ Réserver
  const onBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);

    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (!session) {
      setLoading(false);
      setError("Vous devez être connecté. Allez sur /login.");
      return;
    }

    if (!start || !end) {
      setLoading(false);
      setError("Veuillez choisir un début et une fin.");
      return;
    }

    const s = new Date(start);
    const eDate = new Date(end);

    if (eDate <= s) {
      setLoading(false);
      setError("La fin doit être après le début.");
      return;
    }

    // 🚫 Vérifier les conflits (overlap)
    const { data: conflicts, error: conflictError } = await supabase
      .from("bookings")
      .select("id")
      .eq("parking_id", parkingId)
      .neq("status", "cancelled")
      .lt("start_time", eDate.toISOString())
      .gt("end_time", s.toISOString())
      .limit(1);

    if (conflictError) {
      setLoading(false);
      setError(conflictError.message);
      return;
    }

    if (conflicts && conflicts.length > 0) {
      setLoading(false);
      setError("Ce créneau est déjà réservé.");
      return;
    }

    // ✅ Créer la réservation
    const { error: insertError } = await supabase.from("bookings").insert({
      parking_id: parkingId,
      user_id: session.user.id,
      start_time: s.toISOString(),
      end_time: eDate.toISOString(),
      total_price: computedPrice ?? 0,
      status: "confirmed",
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOk("Réservation confirmée ✅");
  };

  return (
    <form onSubmit={onBook} className="mt-4 space-y-3">
      <p className="text-sm text-gray-600">
        Session :{" "}
        {userEmail ? `connecté (${userEmail})` : "non connecté"}
      </p>

      <label className="block text-sm">
        Début
        <input
          className="w-full border rounded p-2 mt-1"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
      </label>

      <label className="block text-sm">
        Fin
        <input
          className="w-full border rounded p-2 mt-1"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
        />
      </label>

      <p className="text-sm">
        Prix estimé :{" "}
        <span className="font-medium">
          {computedPrice !== null ? `${computedPrice} CHF` : "-"}
        </span>
      </p>

      <button className="w-full border rounded p-2" disabled={loading}>
        {loading ? "Réservation..." : "Réserver"}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {ok && <p className="text-green-700 text-sm">{ok}</p>}
    </form>
  );
}
