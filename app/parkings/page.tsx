"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

type Parking = {
  id: string;
  title: string;
  address: string;
  city: string;
  price_hour: number;
  price_day: number | null;
};

export default function ParkingsPage() {
  const supabase = supabaseBrowser();

  const [city, setCity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [parkings, setParkings] = useState<Parking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Debug visible
  const [clickCount, setClickCount] = useState(0);
  const [lastClick, setLastClick] = useState<string>("jamais");

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("parkings")
        .select("id,title,address,city,price_hour,price_day")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (city.trim() !== "") {
        query = query.ilike("city", `%${city}%`);
      }

      if (maxPrice.trim() !== "") {
        query = query.lte("price_hour", Number(maxPrice));
      }

      const { data, error } = await query;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setParkings((data ?? []) as Parking[]);
      setLoading(false);
    } catch (e: Error | unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Places de parking</h1>

      {/* DEBUG (à garder le temps du test) */}
      <div className="mt-3 text-xs text-gray-600 border rounded p-3">
        <div>Debug clics : <b>{clickCount}</b></div>
        <div>Dernier clic : <b>{lastClick}</b></div>
      </div>

      {/* FILTRES */}
      <div className="mt-4 border rounded p-4 flex flex-wrap gap-3">
        <input
          className="border rounded p-2 flex-1 min-w-[140px]"
          placeholder="Ville (ex: Genève)"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />

        <input
          className="border rounded p-2 flex-1 min-w-[160px]"
          placeholder="Prix max / heure (CHF)"
          type="number"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />

        <button
          type="button"
          className="border rounded px-4 py-2"
          onClick={() => {
            // ✅ Preuve que le clic est capté
            setClickCount((c) => c + 1);
            setLastClick(new Date().toLocaleTimeString());
            load();
          }}
          disabled={loading}
        >
          {loading ? "Recherche..." : "Rechercher"}
        </button>
      </div>

      {error && <p className="mt-6 text-red-600">Erreur : {error}</p>}
      {loading && <p className="mt-6">Chargement…</p>}

      {/* LISTE */}
      <div className="mt-6 space-y-4">
        {!loading && parkings.length === 0 && (
          <p className="text-sm text-gray-500">
            Aucune place trouvée avec ces critères.
          </p>
        )}

        {parkings.map((p) => (
          <Link
            key={p.id}
            href={`/parkings/${p.id}`}
            className="block border rounded p-4 hover:bg-gray-50 transition"
          >
            <h2 className="font-medium">{p.title}</h2>
            <p className="text-sm text-gray-600">
              {p.address} — {p.city}
            </p>
            <p className="mt-2">
              💰 {p.price_hour} CHF / h
              {p.price_day ? ` · ${p.price_day} CHF / jour` : ""}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
