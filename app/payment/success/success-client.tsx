"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Booking = {
  id: string;
  status: string;
  payment_status: string;
};

type State = "loading" | "pending" | "confirmed" | "error";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default function SuccessClient({ bookingId }: { bookingId: string }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string>("");

  // ✅ Validation hors useEffect (pas de setState synchrones dans l’effet)
  const validation = useMemo(() => {
    if (!bookingId) return { ok: false, message: "bookingId manquant." };
    if (!isUuid(bookingId)) return { ok: false, message: "bookingId invalide (UUID attendu)." };
    return { ok: true, message: "" };
  }, [bookingId]);

  useEffect(() => {
    if (!validation.ok) return;

    let cancelled = false;

    const poll = async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,status,payment_status")
        .eq("id", bookingId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setState("error");
        setMsg(error.message);
        return;
      }

      if (!data) {
        setState("pending");
        setMsg("Réservation introuvable pour le moment…");
        return;
      }

      const b = data as Booking;

      if (b.payment_status === "paid" && b.status === "confirmed") {
        setState("confirmed");
        setMsg("Réservation confirmée ✅");
      } else {
        setState("pending");
        setMsg(`En attente… (status=${b.status}, paiement=${b.payment_status})`);
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
  }, [bookingId, supabase, validation.ok]);

  // ✅ UI directe si invalide
  if (!validation.ok) {
    return <p className="text-red-600 text-sm">Erreur : {validation.message}</p>;
  }

  if (state === "confirmed") return <p className="text-green-700 font-medium">{msg}</p>;
  if (state === "pending" || state === "loading")
    return <p className="text-sm text-gray-700">{msg || "Vérification en cours…"}</p>;

  return <p className="text-red-600 text-sm">Erreur : {msg}</p>;
}
