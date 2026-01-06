"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type AvailabilityState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "unavailable" }
  | { state: "error"; message: string };

type AvailApiOk = { available: boolean };
type AvailApiErr = { error?: string; detail?: string };

function toIsoFromLocal(v: string) {
  // datetime-local => string local, on convertit en Date puis ISO
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

export default function BookingForm({
  parkingId,
  parkingTitle,
  priceHour,
  priceDay,
}: {
  parkingId: string;
  parkingTitle: string;
  priceHour: number;
  priceDay: number | null;
}) {
  const { ready, session } = useAuth();

  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailabilityState>({
    state: "idle",
  });

  // internals
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const parsed = useMemo(() => {
    const s = Date.parse(start);
    const e = Date.parse(end);
    const valid = !Number.isNaN(s) && !Number.isNaN(e) && e > s;
    return { s, e, valid };
  }, [start, end]);

  const amountChf = useMemo(() => {
    if (!parsed.valid) return 0;

    const ms = parsed.e - parsed.s;
    const hours = ms / (1000 * 60 * 60);

    // règle simple : si priceDay et >= 8h => jour (arrondi au jour)
    if (priceDay && hours >= 8) {
      const days = Math.max(1, Math.ceil(hours / 24));
      return days * priceDay;
    }

    // sinon arrondi à l’heure
    const h = Math.max(1, Math.ceil(hours));
    return h * priceHour;
  }, [parsed, priceHour, priceDay]);

  // ✅ On calcule la prochaine availability dans l’effet SANS setState sync.
  useEffect(() => {
    // cleanup timers/requests
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!parsed.valid) {
      // planifie l’état idle (évite setState direct dans l’effet)
      queueMicrotask(() => setAvailability({ state: "idle" }));
      return;
    }

    queueMicrotask(() => setAvailability({ state: "checking" }));

    debounceRef.current = window.setTimeout(async () => {
      try {
        abortRef.current = new AbortController();

        const sIso = new Date(parsed.s).toISOString();
        const eIso = new Date(parsed.e).toISOString();

        const url = `/api/bookings/availability?parkingId=${encodeURIComponent(
          parkingId
        )}&start=${encodeURIComponent(sIso)}&end=${encodeURIComponent(eIso)}`;

        const res = await fetch(url, { signal: abortRef.current.signal });
        const json: AvailApiOk | AvailApiErr = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            ("error" in json && json.error) ||
            ("detail" in json && json.detail) ||
            `Erreur disponibilité (${res.status})`;
          setAvailability({ state: "error", message: msg });
          return;
        }

        const ok = json as AvailApiOk;
        setAvailability(ok.available ? { state: "available" } : { state: "unavailable" });
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setAvailability({
          state: "error",
          message: e instanceof Error ? e.message : "Erreur inconnue",
        });
      }
    }, 450);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [parsed.valid, parsed.s, parsed.e, parkingId]);

  const canSubmit =
    ready &&
    !!session &&
    parsed.valid &&
    amountChf > 0 &&
    availability.state === "available" &&
    !loading;

  const onPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ready) return setError("Session en cours de chargement…");
    if (!session) return setError("Connecte-toi d’abord.");
    if (!parsed.valid) return setError("Dates invalides (la fin doit être après le début).");
    if (amountChf <= 0) return setError("Prix invalide.");
    if (availability.state !== "available") return setError("Créneau indisponible.");

    setLoading(true);

    try {
      // 1) create booking (server) – nécessite Bearer token
      const res1 = await fetch("/api/bookings/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          parkingId,
          startTime: new Date(parsed.s).toISOString(),
          endTime: new Date(parsed.e).toISOString(),
          totalPrice: amountChf,
          currency: "CHF",
        }),
      });

      const j1: unknown = await res1.json().catch(() => ({}));
      if (!res1.ok) {
        const msg =
          typeof j1 === "object" && j1 && "error" in j1 && typeof (j1 as { error?: unknown }).error === "string"
            ? (j1 as { error: string }).error
            : `Erreur create booking (${res1.status})`;
        setError(msg);
        setLoading(false);
        return;
      }

      const bookingId =
        typeof j1 === "object" && j1
          ? ((j1 as { bookingId?: string; booking?: { id?: string } }).bookingId ??
              (j1 as { booking?: { id?: string } }).booking?.id)
          : null;

      if (!bookingId) {
        setError("bookingId manquant (API create).");
        setLoading(false);
        return;
      }

      // 2) stripe checkout
      const res2 = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          parkingTitle,
          amountChf,
          currency: "chf",
        }),
      });

      const j2: unknown = await res2.json().catch(() => ({}));
      if (!res2.ok) {
        const msg =
          typeof j2 === "object" && j2 && "error" in j2 && typeof (j2 as { error?: unknown }).error === "string"
            ? (j2 as { error: string }).error
            : `Erreur Stripe checkout (${res2.status})`;
        setError(msg);
        setLoading(false);
        return;
      }

      const url =
        typeof j2 === "object" && j2 && "url" in j2 && typeof (j2 as { url?: unknown }).url === "string"
          ? (j2 as { url: string }).url
          : null;

      if (!url) {
        setError("Stripe Checkout: URL manquante.");
        setLoading(false);
        return;
      }

      window.location.assign(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  const startIso = useMemo(() => toIsoFromLocal(start), [start]);
  const endIso = useMemo(() => toIsoFromLocal(end), [end]);

  return (
    <form onSubmit={onPay} className="space-y-4">
      {/* Dates */}
      <div className="grid gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Début</label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (error) setError(null);
            }}
            required
            className="w-full border rounded-2xl px-4 py-3 text-base bg-white shadow-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800">Fin</label>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              if (error) setError(null);
            }}
            required
            className="w-full border rounded-2xl px-4 py-3 text-base bg-white shadow-sm"
          />
        </div>
      </div>

      {/* Résumé */}
      <div className="rounded-2xl border bg-gradient-to-b from-violet-50 to-white p-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-slate-600">Estimation</span>
          <span className="font-semibold text-slate-900">
            {amountChf > 0 ? `${amountChf} CHF` : "—"}
          </span>
        </div>

        <div className="text-xs text-slate-500">
          {priceDay ? `Tarif : ${priceHour} CHF/h ou ${priceDay} CHF/j` : `Tarif : ${priceHour} CHF/h`}
        </div>

        {/* Disponibilité */}
        {parsed.valid ? (
          <div className="pt-2 text-sm">
            {availability.state === "checking" ? (
              <span className="text-slate-600">Vérification disponibilité…</span>
            ) : availability.state === "available" ? (
              <span className="font-medium text-emerald-700">✅ Disponible</span>
            ) : availability.state === "unavailable" ? (
              <span className="font-medium text-rose-700">❌ Déjà réservé sur ce créneau</span>
            ) : availability.state === "error" ? (
              <span className="text-rose-700">Erreur disponibilité : {availability.message}</span>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>
        ) : null}

        {/* Debug dates (optionnel, utile) */}
        {startIso && endIso && (
          <div className="text-[11px] text-slate-400">
            {startIso} → {endIso}
          </div>
        )}

        {!session && ready ? (
          <div className="text-xs text-slate-600 pt-1">
            Connecte-toi pour payer et réserver.
          </div>
        ) : null}

        {start && end && !parsed.valid ? (
          <div className="text-xs text-rose-700 pt-1">
            Dates invalides : la fin doit être après le début.
          </div>
        ) : null}
      </div>

      {/* CTA */}
      <button
        type="submit"
        className={UI.btnPrimary}
        disabled={!canSubmit}
        title={
          !ready
            ? "Chargement session…"
            : !session
            ? "Connecte-toi d’abord"
            : availability.state !== "available"
            ? "Créneau indisponible"
            : ""
        }
      >
        {loading ? "Redirection…" : "Payer et réserver"}
      </button>

      {error ? <p className="text-sm text-rose-700">Erreur : {error}</p> : null}
    </form>
  );
}
