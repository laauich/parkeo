// app/parkings/ParkingsClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UI } from "@/app/components/ui";

type ParkingType = "outdoor" | "indoor" | "garage";

type ParkingRow = {
  id: string;
  title: string;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  address: string | null;

  price_hour: number | null;
  price_day: number | null;

  parking_type: ParkingType | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  photos: string[] | null;
  is_active: boolean | null;
};

function formatAddress(p: ParkingRow) {
  if (p.address && p.address.trim()) return p.address;

  const a1 = p.street
    ? `${p.street}${p.street_number ? " " + p.street_number : ""}`
    : "";
  const a2 =
    p.postal_code || p.city
      ? `${p.postal_code ?? ""} ${p.city ?? ""}`.trim()
      : "";
  return [a1, a2].filter(Boolean).join(", ");
}

function toTypeLabel(t: ParkingType | null) {
  if (t === "indoor") return "Intérieur";
  if (t === "garage") return "Garage";
  return "Extérieur";
}

export default function ParkingsClient() {
  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | ParkingType>("all");
  const [covered, setCovered] = useState<"all" | "yes" | "no">("all");
  const [secure, setSecure] = useState(false);
  const [lit, setLit] = useState(false);
  const [ev, setEv] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("parkings")
        .select(
          "id,title,street,street_number,postal_code,city,address,price_hour,price_day,parking_type,is_covered,has_ev_charger,is_secure,is_lit,photos,is_active"
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      setRows((data ?? []) as ParkingRow[]);
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return rows.filter((p) => {
      const addr = formatAddress(p).toLowerCase();
      const title = (p.title ?? "").toLowerCase();

      if (needle) {
        const ok = title.includes(needle) || addr.includes(needle);
        if (!ok) return false;
      }

      if (type !== "all" && p.parking_type !== type) return false;

      if (covered !== "all") {
        const isCov = !!p.is_covered;
        if (covered === "yes" && !isCov) return false;
        if (covered === "no" && isCov) return false;
      }

      if (secure && !p.is_secure) return false;
      if (lit && !p.is_lit) return false;
      if (ev && !p.has_ev_charger) return false;

      return true;
    });
  }, [rows, q, type, covered, secure, lit, ev]);

  const onTypeChange = (v: string) => {
    if (v === "all" || v === "outdoor" || v === "indoor" || v === "garage") {
      setType(v);
    }
  };

  return (
    <main className={UI.page}>
      <div className={[UI.container, UI.section].join(" ")}>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className={UI.h1}>Trouver une place</h1>
            <p className={[UI.p, "mt-2"].join(" ")}>
              Recherche par rue / ville + filtres utiles (couverte, sécurisée,
              éclairée…)
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/map" className={[UI.btnBase, UI.btnGhost].join(" ")}>
              Vue carte
            </Link>
            <Link
              href="/parkings/new"
              className={[UI.btnBase, UI.btnPrimary].join(" ")}
            >
              Proposer
            </Link>
          </div>
        </div>

        {/* Filters */}
        <section className={[UI.card, UI.cardPad, "mt-6"].join(" ")}>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">
                Recherche
              </label>
              <input
                className={[UI.input, "mt-1"].join(" ")}
                placeholder="Rue, numéro, code postal, ville…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className={[UI.subtle, "mt-1"].join(" ")}>
                Exemple : “Rue de Lausanne”, “1201”, “Genève”
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700">Type</label>
              <select
                className={[UI.select, "mt-1"].join(" ")}
                value={type}
                onChange={(e) => onTypeChange(e.target.value)}
              >
                <option value="all">Tous</option>
                <option value="outdoor">Extérieur</option>
                <option value="indoor">Intérieur</option>
                <option value="garage">Garage</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700">
                Couverture
              </label>
              <select
                className={[UI.select, "mt-1"].join(" ")}
                value={covered}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "all" || v === "yes" || v === "no") setCovered(v);
                }}
              >
                <option value="all">Peu importe</option>
                <option value="yes">Couverte</option>
                <option value="no">Non couverte</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={[UI.btnBase, secure ? UI.btnPrimary : UI.btnGhost].join(
                " "
              )}
              onClick={() => setSecure((v) => !v)}
            >
              🔒 Sécurisée
            </button>

            <button
              type="button"
              className={[UI.btnBase, lit ? UI.btnPrimary : UI.btnGhost].join(" ")}
              onClick={() => setLit((v) => !v)}
            >
              💡 Éclairée
            </button>

            <button
              type="button"
              className={[UI.btnBase, ev ? UI.btnPrimary : UI.btnGhost].join(" ")}
              onClick={() => setEv((v) => !v)}
            >
              ⚡ Borne EV
            </button>

            <div className="flex-1" />

            <button
              type="button"
              className={[UI.btnBase, UI.btnGhost].join(" ")}
              onClick={() => {
                setQ("");
                setType("all");
                setCovered("all");
                setSecure(false);
                setLit(false);
                setEv(false);
              }}
            >
              Réinitialiser
            </button>

            <button
              type="button"
              className={[UI.btnBase, UI.btnGhost].join(" ")}
              onClick={load}
              disabled={loading}
            >
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>
          </div>
        </section>

        {error && <p className="mt-4 text-sm text-rose-600">Erreur : {error}</p>}

        {/* Results */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {loading ? "Chargement…" : `${filtered.length} place(s) trouvée(s)`}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const photo = p.photos?.[0] ?? null;

              return (
                <Link
                  key={p.id}
                  href={`/parkings/${p.id}`}
                  className={[UI.card, UI.cardHover, "block overflow-hidden"].join(
                    " "
                  )}
                >
                  <div className="w-full h-40 bg-slate-100">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                        Aucune photo
                      </div>
                    )}
                  </div>

                  <div className={UI.cardPad}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {p.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatAddress(p) || "Adresse non renseignée"}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {p.price_hour !== null ? (
                          <div className="text-sm font-semibold text-slate-900">
                            {p.price_hour} CHF/h
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400">—</div>
                        )}
                        {p.price_day !== null ? (
                          <div className="text-xs text-slate-500">
                            {p.price_day} CHF/j
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={UI.chip}>{toTypeLabel(p.parking_type)}</span>
                      <span className={UI.chip}>
                        {p.is_covered ? "Couverte" : "Non couverte"}
                      </span>
                      {p.is_secure ? <span className={UI.chip}>🔒</span> : null}
                      {p.is_lit ? <span className={UI.chip}>💡</span> : null}
                      {p.has_ev_charger ? <span className={UI.chip}>⚡ EV</span> : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Voir détails →</span>
                      <span className={UI.chip}>Disponible</span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {!loading && filtered.length === 0 && (
              <div className={[UI.card, UI.cardPad].join(" ")}>
                <div className="font-semibold text-slate-900">Aucun résultat</div>
                <p className={[UI.p, "mt-2"].join(" ")}>
                  Essaie de retirer des filtres ou d’élargir la recherche.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
