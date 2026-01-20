"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type AvailabilityState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "unavailable"; reason?: string }
  | { state: "error"; message: string };

type AvailApiOk = { available: boolean; reason?: string };
type AvailApiErr = { error?: string; detail?: string; code?: string };

function toIsoFromLocal(v: string) {
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function extractApiErrorMessage(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const o = json as Record<string, unknown>;

  const detail = typeof o.detail === "string" ? o.detail : null;
  const error = typeof o.error === "string" ? o.error : null;
  const message = typeof o.message === "string" ? o.message : null;

  return detail || error || message || fallback;
}

function mapBooking409ToUserMessage(payload: unknown): string {
  // Ton API renvoie { ok:false, error:"Créneau indisponible", detail:"...", code:"..." }
  if (!payload || typeof payload !== "object") return "Créneau indisponible.";

  const o = payload as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : "";
  const detail = typeof o.detail === "string" ? o.detail : "";
  const error = typeof o.error === "string" ? o.error : "Créneau indisponible";

  switch (code) {
    case "PARKING_OFF":
      return detail || "Cette place est désactivée par le propriétaire.";
    case "BOOKING_OVERLAP":
      return detail || "Cette place est déjà réservée sur ce créneau.";
    case "BLACKOUT":
      return detail || "Cette place est indisponible sur ce créneau (blackout).";
    case "OUTSIDE_AVAILABILITY":
      return detail || "La réservation est hors des horaires définis par le propriétaire.";
    case "INDISPONIBLE_OFF":
      return "Cette place est OFF ce jour-là.";
    case "INDISPONIBLE_OUTSIDE_HOURS":
      return "La réservation est hors des horaires définis par le propriétaire.";
    case "INDISPONIBLE_BLACKOUT":
      return "Cette place est indisponible sur ce créneau (blackout).";
    case "INDISPONIBLE_MULTI_DAY":
      return "La réservation multi-jour n’est pas disponible pour cette place.";
    default:
      return detail || error || "Créneau indisponible.";
  }
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

  // Availability check (déjà présent) + UX améliorée
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!parsed.valid) {
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
            ("error" in json && typeof json.error === "string" && json.error) ||
            ("detail" in json && typeof json.detail === "string" && json.detail) ||
            `Erreur disponibilité (${res.status})`;
          setAvailability({ state: "error", message: msg });
          return;
        }

        const ok = json as AvailApiOk;
        setAvailability(ok.available ? { state: "available" } : { state: "unavailable", reason: ok.reason });
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

  // ✅ Griser si checking / unavailable / error (et uniquement si dates valides)
  const disabledCard =
    parsed.valid &&
    (availability.state === "checking" ||
      availability.state === "unavailable" ||
      availability.state === "error");

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
      // 1) create booking (server)
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
        // ✅ cas important: 409 = indisponible (planning, blackout, overlap, OFF)
        if (res1.status === 409) {
          const msg409 = mapBooking409ToUserMessage(j1);

          // ✅ on force aussi l'état dispo en "unavailable" pour griser + badge
          setAvailability({ state: "unavailable", reason: msg409 });

          setError(msg409);
          setLoading(false);
          return;
        }

        const msg = extractApiErrorMessage(j1, `Erreur create booking (${res1.status})`);
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          bookingId,
          parkingTitle,
          amountChf,
          currency: "chf",
        }),
      });

      const j2: unknown = await res2.json().catch(() => ({}));

      if (!res2.ok) {
        const msg = extractApiErrorMessage(j2, `Erreur Stripe checkout (${res2.status})`);
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

  const statusLine =
    availability.state === "checking"
      ? { text: "Vérification disponibilité…", cls: "text-slate-600" }
      : availability.state === "available"
      ? { text: "✅ Disponible", cls: "font-medium text-emerald-700" }
      : availability.state === "unavailable"
      ? {
          text: availability.reason ? `❌ Indisponible — ${availability.reason}` : "❌ Indisponible sur ce créneau",
          cls: "font-medium text-rose-700",
        }
      : availability.state === "error"
      ? { text: `Erreur disponibilité : ${availability.message}`, cls: "text-rose-700" }
      : { text: "—", cls: "text-slate-500" };

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
            className={UI.input}
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
            className={UI.input}
          />
        </div>
      </div>

      {/* Résumé */}
      <div
        className={cx(
          UI.card,
          UI.cardPad,
          "bg-gradient-to-b from-violet-50/80 to-white",
          disabledCard ? "opacity-60 grayscale" : ""
        )}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-slate-600">Estimation</span>
            <span className="font-semibold text-slate-900">{amountChf > 0 ? `${amountChf} CHF` : "—"}</span>
          </div>

          <div className="text-xs text-slate-500">
            {priceDay ? `Tarif : ${priceHour} CHF/h ou ${priceDay} CHF/j` : `Tarif : ${priceHour} CHF/h`}
          </div>

          {parsed.valid ? <div className={cx("pt-2 text-sm", statusLine.cls)}>{statusLine.text}</div> : null}

          {/* Debug (optionnel) */}
          {startIso && endIso ? (
            <div className="text-[11px] text-slate-400">
              {startIso} → {endIso}
            </div>
          ) : null}

          {!session && ready ? (
            <div className="text-xs text-slate-600 pt-1">Connecte-toi pour payer et réserver.</div>
          ) : null}

          {start && end && !parsed.valid ? (
            <div className="text-xs text-rose-700 pt-1">Dates invalides : la fin doit être après le début.</div>
          ) : null}

          {/* ✅ label visuel */}
          {parsed.valid && (availability.state === "unavailable" || availability.state === "error") ? (
            <div className="pt-1 text-xs font-medium text-rose-700">Indisponible</div>
          ) : null}
        </div>
      </div>

      {/* CTA */}
      <button
        type="submit"
        className={cx(UI.btnBase, UI.btnPrimary, "w-full", !canSubmit ? "opacity-60 cursor-not-allowed" : "")}
        disabled={!canSubmit}
        title={
          !ready
            ? "Chargement session…"
            : !session
            ? "Connecte-toi d’abord"
            : !parsed.valid
            ? "Dates invalides"
            : availability.state === "checking"
            ? "Vérification disponibilité…"
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
