"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type MyParkingRow = {
  id: string;
  title: string;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  price_hour: number | null;
  is_active: boolean | null;
  photos: string[] | null;
};

function formatAddr(p: MyParkingRow) {
  const a1 = p.street ? `${p.street}${p.street_number ? " " + p.street_number : ""}` : "";
  const a2 = p.postal_code || p.city ? `${p.postal_code ?? ""} ${p.city ?? ""}`.trim() : "";
  return [a1, a2].filter(Boolean).join(", ");
}

export default function MyParkingsPage() {
  const { supabase, ready, session } = useAuth();
  const [rows, setRows] = useState<MyParkingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);

    if (!ready) return;
    if (!session) {
      setRows([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("parkings")
      .select(
        "id,title,street,street_number,postal_code,city,price_hour,is_active,photos"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as MyParkingRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id]);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mes places</h1>
          <p className="text-sm text-gray-600">
            Gérez vos places et consultez les réservations reçues.
          </p>
        </div>

        <div className="flex gap-2">
          <Link className={UI.btnGhost} href="/map">
            Voir la carte
          </Link>
          <Link className={UI.btnPrimary} href="/parkings/new">
            Créer une place
          </Link>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

      {!session && ready && (
        <section className="border rounded p-6">
          <p className="text-sm text-gray-700">Connecte-toi pour voir tes places.</p>
          <Link className="underline" href="/login">
            Aller au login →
          </Link>
        </section>
      )}

      {session && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Session : <b>{session.user.email ?? "connecté"}</b>
            </div>

            <button className={UI.btnGhost} onClick={load} disabled={loading}>
              {loading ? "…" : "Rafraîchir"}
            </button>
          </div>

          {rows.length === 0 && !loading && (
            <p className="text-sm text-gray-600">
              Aucune place.{" "}
              <Link className="underline" href="/parkings/new">
                Créer une place →
              </Link>
            </p>
          )}

          {rows.map((p) => {
            const photo = p.photos?.[0] ?? null;
            return (
              <div key={p.id} className="border rounded overflow-hidden">
                <div className="flex">
                  <div className="w-36 h-24 bg-gray-100 shrink-0">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                        —
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {formatAddr(p) || "Adresse non renseignée"}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {p.price_hour !== null ? `${p.price_hour} CHF/h` : "Prix non renseigné"}
                          {" · "}
                          {p.is_active ? "Active" : "Inactive"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link className={UI.btnGhost} href={`/my-parkings/${p.id}/edit`}>
                          Modifier
                        </Link>

                        <Link className={UI.btnGhost} href={`/my-parkings/${p.id}/bookings`}>
                          Réservations
                        </Link>

                        <Link className={UI.btnGhost} href={`/parkings/${p.id}`}>
                          Voir
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
