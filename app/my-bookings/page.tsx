"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UI } from "@/app/components/ui";

type BookingRow = {
  id: string;
  parking_id: string;
  start_time: string;
  end_time: string;
  total_price: number;
  status: string;
};

export default function MyBookingsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState<string>("(chargement…)");
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = supabaseBrowser();

      const { data: s } = await supabase.auth.getSession();
      const session = s.session;

      if (!session) {
        setUserEmail("non connecté");
        setBookings([]);
        setLoading(false);
        return;
      }

      setUserEmail(session.user.email ?? "connecté");

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
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  useEffect(() => {
  queueMicrotask(() => {
    void load();
  });
}, []);


  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mes réservations</h1>
          <p className="text-sm text-gray-600">
            Session : <b>{userEmail}</b>
          </p>
        </div>

        <div className="flex gap-2">
          <button className={UI.btnGhost} onClick={load} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </button>
          <Link className={UI.btnGhost} href="/parkings">
            Parkings
          </Link>
        </div>
      </div>

      {error && <p className="text-red-600">Erreur : {error}</p>}

      {!loading && bookings.length === 0 && userEmail !== "non connecté" && (
        <p className="text-sm text-gray-600">Aucune réservation.</p>
      )}

      {userEmail === "non connecté" && (
        <div className="border rounded p-4 text-sm text-gray-600">
          Tu dois te connecter pour voir tes réservations.
          <div className="mt-2">
            <Link className={UI.btnPrimary} href="/login">
              Se connecter
            </Link>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((b) => (
          <div key={b.id} className="border rounded p-4 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Link className={UI.navLink} href={`/parkings/${b.parking_id}`}>
                Voir la place
              </Link>
              <span className={UI.chip}>{b.status}</span>
            </div>

            <p className="text-sm">
              <span className="font-medium">Début :</span>{" "}
              {new Date(b.start_time).toLocaleString()}
            </p>
            <p className="text-sm">
              <span className="font-medium">Fin :</span>{" "}
              {new Date(b.end_time).toLocaleString()}
            </p>
            <p className="text-sm">
              <span className="font-medium">Prix :</span> {b.total_price} CHF
            </p>
          </div>
        ))}
      </div>

      <Link href="/" className={UI.navLink}>
        ← Accueil
      </Link>
    </main>
  );
}
