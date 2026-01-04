"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

function clearAllPendingKeys() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("parkeo:pending:")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}

export default function SuccessClient({ bookingId }: { bookingId: string }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string>("");

  // (optionnel) debug
  const [cleanupInfo, setCleanupInfo] = useState<string>("");

  // empêcher double redirection si re-render
  const redirectedRef = useRef(false);

  const validation = useMemo(() => {
    if (!bookingId) return { ok: false, message: "bookingId manquant." };
    if (!isUuid(bookingId))
      return { ok: false, message: "bookingId invalide (UUID attendu)." };
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

        // ✅ Nettoyage + redirection vers mes réservations
        if (!redirectedRef.current) {
          redirectedRef.current = true;

          queueMicrotask(() => {
            const n = clearAllPendingKeys();
            setCleanupInfo(
              n > 0 ? `Nettoyage OK (${n} lock(s) supprimé(s))` : "Nettoyage OK"
            );

            // petit délai pour afficher le message confirmé
            setTimeout(() => {
              router.push("/my-bookings");
            }, 1200);
          });
        }
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
  }, [bookingId, supabase, validation.ok, router]);

  if (!validation.ok) {
    return <p className="text-red-600 text-sm">Erreur : {validation.message}</p>;
  }

  if (state === "confirmed") {
    return (
      <div className="space-y-2">
        <p className="text-green-700 font-medium">{msg}</p>
        <p className="text-sm text-gray-600">
          Redirection vers <b>Mes réservations</b>…
        </p>
        {cleanupInfo ? <p className="text-xs text-gray-500">{cleanupInfo}</p> : null}
        <div className="pt-1">
          <Link className="underline text-sm" href="/my-bookings">
            Aller tout de suite →
          </Link>
        </div>
      </div>
    );
  }

  if (state === "pending" || state === "loading") {
    return <p className="text-sm text-gray-700">{msg || "Vérification en cours…"}</p>;
  }

  return <p className="text-red-600 text-sm">Erreur : {msg}</p>;
}
