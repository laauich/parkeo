"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useAuth } from "../providers/AuthProvider";

type BookingRow = {
  id: string;
  parking_id: string;
  start_time: string;
  end_time: string;
  total_price: number;
  status: string;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Erreur inconnue";
}

export default function MyBookingsPage() {
  const supabase = supabaseBrowser();
  const { session, ready } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const load = async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    try {
      const { data: rows, error: qErr } = await supabase
        .from("bookings")
        .select("id,parking_id,start_time,end_time,total_price,status")
        .order("start_time", { ascending: false });

      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }

      setBookings((rows ?? []) as BookingRow[]);
      setLoading(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;

    if (!session) {
      setBookings([]);
      return;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id]);

  const cancelBooking = async (id: string) => {
    setError(null);
    const { error: uErr } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (uErr) {
      setError(uErr.message);
      return;
    }

    await load();
  };

  const email = session?.user?.email ?? null;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Mes réservations</h1>

      {!ready && <p className="mt-4 text-sm text-gray-500">Chargement…</p>}

      {ready && !session && (
        <p className="mt-4 text-sm text-gray-600">
          Vous n’êtes pas connecté.{" "}
          <Link className="underline" href="/login">
            Se connecter
          </Link>
        </p>
      )}

      {ready && session && (
        <p className="mt-2 text-sm text-gray-600">Connecté : {email}</p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="border rounded px-4 py-2"
          disabled={loading || !session}
          onClick={load}
        >
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>

        <Link className="underline py-2" href="/parkings">
          Aller aux parkings
        </Link>
      </div>

      {error && <p className="mt-6 text-red-600">Erreur : {error}</p>}

      <div className="mt-6 space-y-4">
        {ready && session && !loading && bookings.length === 0 && (
          <p className="text-sm text-gray-500">Aucune réservation.</p>
        )}

        {bookings.map((b) => (
          <div key={b.id} className="border rounded p-4">
            <p className="text-sm text-gray-600">
              <Link className="underline" href={`/parkings/${b.parking_id}`}>
                Voir la place
              </Link>
            </p>

            <p className="mt-2">
              <span className="font-medium">Début :</span>{" "}
              {new Date(b.start_time).toLocaleString()}
            </p>
            <p>
              <span className="font-medium">Fin :</span>{" "}
              {new Date(b.end_time).toLocaleString()}
            </p>
            <p className="mt-2">
              <span className="font-medium">Prix :</span> {b.total_price} CHF
            </p>
            <p className="mt-1">
              <span className="font-medium">Statut :</span> {b.status}
            </p>

            {b.status !== "cancelled" ? (
              <button
                type="button"
                className="mt-3 border rounded px-3 py-2"
                onClick={() => cancelBooking(b.id)}
              >
                Annuler
              </button>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Annulée</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
