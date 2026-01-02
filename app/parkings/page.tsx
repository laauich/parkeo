"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UI } from "@/app/components/ui";

type ParkingRow = {
  id: string;
  title: string;
  address: string;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  parking_type: "outdoor" | "indoor" | "garage" | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  price_hour: number;
  price_day: number | null;

  photos: string[] | null;

  created_at: string;
  is_active: boolean | null;
};

type SortKey = "recent" | "price_asc";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs text-gray-700">
      {children}
    </span>
  );
}

function typeLabel(t: ParkingRow["parking_type"]) {
  if (t === "indoor") return "Intérieur";
  if (t === "garage") return "Garage";
  return "Extérieur";
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

export default function ParkingsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Filtres
  const [streetQuery, setStreetQuery] = useState("");
  const [city, setCity] = useState("Genève");

  const [type, setType] = useState<"" | "outdoor" | "indoor" | "garage">("");
  const [covered, setCovered] = useState(false);
  const [ev, setEv] = useState(false);
  const [secure, setSecure] = useState(false);
  const [lit, setLit] = useState(false);

  const [sort, setSort] = useState<SortKey>("recent");

  // Data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParkingRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      let q = supabase
        .from("parkings")
        .select(
          "id,title,address,street,street_number,postal_code,city,parking_type,is_covered,has_ev_charger,is_secure,is_lit,price_hour,price_day,photos,created_at,is_active"
        )
        .eq("is_active", true);

      // Ville
      if (city.trim()) {
        q = q.ilike("city", `%${city.trim()}%`);
      }

      // Rue (recherche sur street + fallback sur address)
      if (streetQuery.trim()) {
        // On utilise OR pour matcher street OU address
        // NB: format: or('col.ilike.%x%,other.ilike.%x%')
        const x = streetQuery.trim().replace(/,/g, " "); // évite casser la syntaxe
        q = q.or(`street.ilike.%${x}%,address.ilike.%${x}%`);
      }

      // Type
      if (type) {
        q = q.eq("parking_type", type);
      }

      // Booléens
      if (covered) q = q.eq("is_covered", true);
      if (ev) q = q.eq("has_ev_charger", true);
      if (secure) q = q.eq("is_secure", true);
      if (lit) q = q.eq("is_lit", true);

      // Tri
      if (sort === "price_asc") {
        q = q.order("price_hour", { ascending: true });
      } else {
        q = q.order("created_at", { ascending: false });
      }

      const { data, error: qErr } = await q.limit(60);

      if (qErr) throw new Error(qErr.message);

      setRows((data ?? []) as ParkingRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  // Charger au premier rendu
  useEffect(() => {
    // éviter la règle eslint setState-in-effect : on déclenche via microtask
    Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = rows.length;

  const resetFilters = () => {
    setStreetQuery("");
    setCity("Genève");
    setType("");
    setCovered(false);
    setEv(false);
    setSecure(false);
    setLit(false);
    setSort("recent");
    Promise.resolve().then(load);
  };

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trouver une place</h1>
          <p className="text-sm text-gray-600">
            Filtre par rue, type, options (EV, sécurisé…) — Genève (MVP).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className={UI.btnGhost} href="/map">
            Voir sur carte
          </Link>
          <Link className={UI.btnPrimary} href="/parkings/new">
            Proposer ma place
          </Link>
        </div>
      </div>

      {/* Filtres */}
      <section className="border rounded p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Rue (ou adresse)</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={streetQuery}
              onChange={(e) => setStreetQuery(e.target.value)}
              placeholder="Ex: Rue du Rhône"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Ville</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex: Genève"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "" | "outdoor" | "indoor" | "garage")
              }
            >
              <option value="">Tous</option>
              <option value="outdoor">Extérieur</option>
              <option value="indoor">Intérieur</option>
              <option value="garage">Garage</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={covered}
              onChange={(e) => setCovered(e.target.checked)}
            />
            Couvert
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ev}
              onChange={(e) => setEv(e.target.checked)}
            />
            ⚡ Borne EV
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
            />
            🔒 Sécurisé
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={lit}
              onChange={(e) => setLit(e.target.checked)}
            />
            💡 Éclairé
          </label>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Tri</span>
            <select
              className="border rounded px-2 py-1"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="recent">Plus récent</option>
              <option value="price_asc">Prix / h croissant</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={UI.btnPrimary}
            onClick={load}
            disabled={loading}
          >
            {loading ? "Recherche…" : "Rechercher"}
          </button>

          <button
            type="button"
            className={UI.btnGhost}
            onClick={resetFilters}
            disabled={loading}
          >
            Réinitialiser
          </button>

          <div className="text-sm text-gray-600">
            Résultats : <b>{loading ? "…" : count}</b>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">Erreur : {error}</p>}
      </section>

      {/* Résultats */}
      <section className="space-y-3">
        {!loading && rows.length === 0 ? (
          <div className="border rounded p-6 text-sm text-gray-600">
            Aucune place trouvée. Essaie une autre rue, ou enlève des filtres.
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((p) => {
            const photos = safeArr(p.photos);
            const cover = photos[0];

            return (
              <Link
                key={p.id}
                href={`/parkings/${p.id}`}
                className="border rounded overflow-hidden hover:bg-gray-50 transition"
              >
                {/* Image */}
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                    Pas de photo
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-sm text-gray-600">{p.address}</div>
                    </div>

                    <div className="text-sm whitespace-nowrap">
                      <span className="font-medium">{p.price_hour}</span> CHF/h
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge>{typeLabel(p.parking_type)}</Badge>
                    {p.is_covered ? <Badge>Couvert</Badge> : <Badge>Non couvert</Badge>}
                    {p.has_ev_charger ? <Badge>⚡ EV</Badge> : null}
                    {p.is_secure ? <Badge>🔒 Sécurisé</Badge> : null}
                    {p.is_lit ? <Badge>💡 Éclairé</Badge> : null}
                    {p.price_day ? <Badge>{p.price_day} CHF/j</Badge> : null}
                  </div>

                  <div className="text-xs text-gray-500">
                    Ajouté le {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
