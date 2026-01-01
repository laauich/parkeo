"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Booking = {
  id: string;
  status: string;
  payment_status: string;
};

type State = "loading" | "pending" | "confirmed" | "error";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function SuccessClient({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseBrowser();

    const poll = async () => {
      if (!bookingId) {
        if (!cancelled) {
          setState("error");
          setMsg("bookingId manquant.");
        }
        return;
      }

      if (!isUuid(bookingId)) {
        if (!cancelled) {
          setState("error");
          setMsg("bookingId invalide (UUID attendu).");
        }
        return;
      }

      const { data, error } = await supabase
        .from("bookings")
        .select("id,status,payment_status")
        .eq("id", bookingId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setState("error");
        setMsg(error?.message ?? "Réservation introuvable.");
        return;
      }

      const booking = data as Booking;

      if (booking.payment_status === "paid" && booking.status === "confirmed") {
        setState("confirmed");
        setMsg("Réservation confirmée ✅");
      } else {
        setState("pending");
        setMsg("En attente de confirmation du paiement…");
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    const timeout = setTimeout(() => clearInterval(interval), 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [bookingId]);

  if (state === "confirmed") return <p className="text-green-700 font-medium">{msg}</p>;
  if (state === "pending" || state === "loading")
    return <p className="text-sm text-gray-700">{msg || "Chargement…"}</p>;
  return <p className="text-red-600 text-sm">Erreur : {msg}</p>;
}
