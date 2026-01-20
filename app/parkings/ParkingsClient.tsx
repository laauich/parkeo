// app/parkings/ParkingsClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UI } from "@/app/components/ui";

type ParkingType = "outdoor" | "indoor" | "garage";

export type ParkingRow = {
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

function normalizeRows(input: unknown): ParkingRow[] {
  if (!Array.isArray(input)) return [];
  return (input as ParkingRow[]).filter((x) => x && typeof x.id === "string");
}

function sameRow(a: ParkingRow, b: ParkingRow) {
  // comparaison “cheap” suffisante pour éviter flicker
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.address === b.address &&
    a.street === b.street &&
    a.street_number === b.street_number &&
    a.postal_code === b.postal_code &&
    a.city === b.city &&
    a.price_hour === b.price_hour &&
    a.price_day === b.price_day &&
    a.parking_type === b.parking_type &&
    a.is_covered === b.is_covered &&
    a.has_ev_charger === b.has_ev_charger &&
    a.is_secure === b.is_secure &&
    a.is_lit === b.is_lit &&
    JSON.stringify(a.photos ?? []) === JSON.stringify(b.photos ?? []) &&
    a.is_active === b.is_active
  );
}

function sameList(a: ParkingRow[], b: ParkingRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!sameRow(a[i]!, b[i]!)) return false;
  }
  return true;
}

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

type AvState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "unavailable"; reason?: string }
  | { state: "error"; message: string };

type AvailApiOk = { available: boolean; reason?: string };
type AvailApiErr = { error?: string; detail?: string; reason?: string };

function extractReason(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const o = json as Record<string, unknown>;
  const reason = typeof o.reason === "string" ? o.reason : undefined;
  const detail = typeof o.detail === "string" ? o.detail : undefined;
  const error = typeof o.error === "string" ? o.error : undefined;
  return reason || detail || error || undefined;
}

export default function ParkingsClient({
  initialRows,
}: {
  initialRows?: ParkingRow[];
}) {
  const [rows, setRows] = useState<ParkingRow[]>(
    normalizeRows(initialRows) ?? []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // “mis à jour”
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | ParkingType>("all");
  const [covered, setCovered] = useState<"all" | "yes" | "no">("all");
  const [secure, setSecure] = useState(false);
  const [lit, setLit] = useState(false);
  const [ev, setEv] = useState(false);

  // éviter double fetch en React StrictMode (dev)
  const didMountRef = useRef(false);

  // ✅ Disponibilité “now → +1h” par parkingId
  const [availabilityById, setAvailabilityById] = useState<
    Record<string, AvState>
  >({});

  // ✅ garde un “runId” pour ignorer les vieux retours fetch
  const runIdRef = useRef(0);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    if (!silent) setLoading(true);
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

      const next = normalizeRows(data ?? []);
      setRows((prev) => (sameList(prev, next) ? prev : next));
      setLastUpdatedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setRows((prev) => prev);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;

    // ✅ SWR-like : on affiche initialRows tout de suite puis refresh en arrière-plan
    void load({ silent: rows.length > 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const updatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return null;
    const d = new Date(lastUpdatedAt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `Mis à jour à ${hh}:${mm}`;
  }, [lastUpdatedAt]);

  // ✅ Check disponibilité “now → +1h” pour les cards visibles (filtered)
  useEffect(() => {
    if (filtered.length === 0) return;

    runIdRef.current += 1;
    const myRunId = runIdRef.current;

    // set "checking" pour ceux qui n'ont pas encore un state
    setAvailabilityById((prev) => {
      const next = { ...prev };
      for (const p of filtered) {
        if (!next[p.id]) next[p.id] = { state: "checking" };
      }
      return next;
    });

    const controller = new AbortController();

    const run = async () => {
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      // limiter la charge
      const concurrency = 10;
      let idx = 0;

      const worker = async () => {
        while (idx < filtered.length) {
          const i = idx++;
          const p = filtered[i];
          if (!p) continue;

          try {
            const url = `/api/bookings/availability?parkingId=${encodeURIComponent(
              p.id
            )}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(
              endIso
            )}`;

            const res = await fetch(url, { signal: controller.signal });
            const json: AvailApiOk | AvailApiErr = await res
              .json()
              .catch(() => ({}));

            // si un nouveau run a démarré, ignorer
            if (runIdRef.current !== myRunId) return;

            if (!res.ok) {
              const msg =
                extractReason(json) ?? `Erreur disponibilité (${res.status})`;
              setAvailabilityById((prev) => ({
                ...prev,
                [p.id]: { state: "error", message: msg },
              }));
              continue;
            }

            const ok = json as AvailApiOk;

            setAvailabilityById((prev) => ({
              ...prev,
              [p.id]: ok.available
                ? { state: "available" }
                : { state: "unavailable", reason: ok.reason },
            }));
          } catch (e: unknown) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            if (runIdRef.current !== myRunId) return;

            const msg = e instanceof Error ? e.message : "Erreur inconnue";
            setAvailabilityById((prev) => ({
              ...prev,
              [p.id]: { state: "error", message: msg },
            }));
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, filtered.length) },
          () => worker()
        )
      );
    };

    void run();

    return () => controller.abort();
  }, [filtered]);

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
            {updatedLabel ? (
              <p className={[UI.subtle, "mt-1"].join(" ")}>{updatedLabel}</p>
            ) : null}
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
              className={[UI.btnBase, lit ? UI.btnPrimary : UI.btnGhost].join(
                " "
              )}
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
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>
          </div>
        </section>

        {error ? (
          <p className="mt-4 text-sm text-rose-600">Erreur : {error}</p>
        ) : null}

        {/* Results */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {loading && rows.length === 0
                ? "Chargement…"
                : `${filtered.length} place(s) trouvée(s)`}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const photo = p.photos?.[0] ?? null;

              const av = availabilityById[p.id] ?? { state: "checking" as const };

              const unavailable = av.state === "unavailable";

              const status =
                av.state === "checking"
                  ? { text: "Vérification…", cls: "text-slate-600" }
                  : av.state === "available"
                  ? { text: "Disponible", cls: "font-medium text-emerald-700" }
                  : av.state === "unavailable"
                  ? {
                      text: av.reason
                        ? `Indisponible — ${av.reason}`
                        : "Indisponible",
                      cls: "font-medium text-rose-700",
                    }
                  : av.state === "error"
                  ? { text: "Disponibilité inconnue", cls: "font-medium text-amber-700" }
                  : { text: "—", cls: "text-slate-500" };

              return (
                <Link
                  key={p.id}
                  href={`/parkings/${p.id}`}
                  className={cx(
                    UI.card,
                    UI.cardHover,
                    "block overflow-hidden",
                    unavailable ? "opacity-60 grayscale" : ""
                  )}
                  title={
                    av.state === "unavailable"
                      ? av.reason || "Indisponible"
                      : av.state === "checking"
                      ? "Vérification disponibilité…"
                      : ""
                  }
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
                      <span className={UI.chip}>
                        {toTypeLabel(p.parking_type)}
                      </span>
                      <span className={UI.chip}>
                        {p.is_covered ? "Couverte" : "Non couverte"}
                      </span>
                      {p.is_secure ? <span className={UI.chip}>🔒</span> : null}
                      {p.is_lit ? <span className={UI.chip}>💡</span> : null}
                      {p.has_ev_charger ? (
                        <span className={UI.chip}>⚡ EV</span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className={cx(UI.chip, status.cls)}>{status.text}</span>

                      <span
                        className={[
                          UI.btnBase,
                          UI.btnPrimary,
                          "px-3 py-1.5 text-xs",
                          "rounded-full",
                          "pointer-events-none",
                          unavailable ? "opacity-70" : "",
                        ].join(" ")}
                      >
                        Détails
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {!loading && filtered.length === 0 ? (
              <div className={[UI.card, UI.cardPad].join(" ")}>
                <div className="font-semibold text-slate-900">Aucun résultat</div>
                <p className={[UI.p, "mt-2"].join(" ")}>
                  Essaie de retirer des filtres ou d’élargir la recherche.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 text-xs text-slate-500">
            * “Disponible / Indisponible” correspond à un check <b>maintenant → +1h</b> (planning propriétaire, blackouts, réservations).
          </div>
        </section>
      </div>
    </main>
  );
}
