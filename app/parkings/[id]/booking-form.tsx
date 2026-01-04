"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type AvailabilityState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "unavailable" }
  | { state: "error"; message: string };

type PendingInfo = {
  bookingId: string;
  createdAt: string; // ISO
};

const PENDING_TTL_MINUTES = 10;

function lsKey(parkingId: string) {
  return `parkeo:pending:${parkingId}`;
}

function readPending(parkingId: string): PendingInfo | null {
  try {
    const raw = localStorage.getItem(lsKey(parkingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingInfo;
    if (!parsed?.bookingId || !parsed?.createdAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePending(parkingId: string, info: PendingInfo) {
  try {
    localStorage.setItem(lsKey(parkingId), JSON.stringify(info));
  } catch {
    // ignore
  }
}

function clearPending(parkingId: string) {
  try {
    localStorage.removeItem(lsKey(parkingId));
  } catch {
    // ignore
  }
}

function msFromIso(iso: string) {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function formatMmSs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
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

  // Paiement en cours / reprise
  const [pending, setPending] = useState<PendingInfo | null>(null);

  // ✅ FIX ESLint: initialiser ici, pas de setState sync dans useEffect
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Tick pour countdown (1s) — setState uniquement dans callback (OK)
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Charger pending depuis localStorage au mount
  useEffect(() => {
    queueMicrotask(() => {
      const p = readPending(parkingId);
      setPending(p);
    });
  }, [parkingId]);

  const pendingRemainingMs = useMemo(() => {
    if (!pending) return 0;
    const created = msFromIso(pending.createdAt);
    if (!created) return 0;
    const ttl = PENDING_TTL_MINUTES * 60 * 1000;
    const endMs = created + ttl;
    return Math.max(0, endMs - nowMs);
  }, [pending, nowMs]);

  const pendingExpired = useMemo(() => {
    return pending ? pendingRemainingMs <= 0 : false;
  }, [pending, pendingRemainingMs]);

  // Parsing dates
  const parsed = useMemo(() => {
    const s = Date.parse(start);
    const e = Date.parse(end);
    const valid = !Number.isNaN(s) && !Number.isNaN(e) && e > s;
    return { s, e, valid };
  }, [start, end]);

  // Estimation
  const amountChf = useMemo(() => {
    if (!parsed.valid) return 0;

    const ms = parsed.e - parsed.s;
    const hours = ms / (1000 * 60 * 60);

    if (priceDay && hours >= 8) {
      const days = Math.ceil(hours / 24);
      return Math.max(1, days) * priceDay;
    }

    return Math.max(1, Math.ceil(hours)) * priceHour;
  }, [parsed, priceHour, priceDay]);

  // Disponibilité (debounce + abort)
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
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setAvailability({
            state: "error",
            message: json?.error ?? `Erreur disponibilité (${res.status})`,
          });
          return;
        }

        if (json?.available) setAvailability({ state: "available" });
        else setAvailability({ state: "unavailable" });
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

  const onStartChange = (v: string) => {
    setStart(v);
    if (error) setError(null);
  };
  const onEndChange = (v: string) => {
    setEnd(v);
    if (error) setError(null);
  };

  const isLockedByPending = useMemo(() => {
    return !!pending && !pendingExpired;
  }, [pending, pendingExpired]);

  const canSubmit =
    ready &&
    !!session &&
    parsed.valid &&
    amountChf > 0 &&
    availability.state === "available" &&
    !loading &&
    !isLockedByPending;

  const onPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ready) return setError("Session en cours de chargement…");
    if (!session) return setError("Connecte-toi d’abord.");
    if (isLockedByPending)
      return setError("Paiement déjà en cours sur cette place.");
    if (!parsed.valid)
      return setError("Dates invalides (la fin doit être après le début).");
    if (amountChf <= 0) return setError("Prix invalide.");
    if (availability.state !== "available")
      return setError("Créneau indisponible.");

    setLoading(true);

    try {
      // 1) create booking (pending_payment)
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

      const j1 = await res1.json().catch(() => ({}));
      if (!res1.ok) {
        setError(j1?.error ?? `Erreur create booking (${res1.status})`);
        setLoading(false);
        return;
      }

      const bookingId = j1.bookingId ?? j1?.booking?.id;
      if (!bookingId) {
        setError("bookingId manquant (API create).");
        setLoading(false);
        return;
      }

      // save pending locally to lock UI + allow resume
      const info: PendingInfo = {
        bookingId,
        createdAt: new Date().toISOString(),
      };
      writePending(parkingId, info);
      setPending(info);

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

      const j2 = await res2.json().catch(() => ({}));
      if (!res2.ok) {
        setError(j2?.error ?? `Erreur Stripe checkout (${res2.status})`);
        setLoading(false);
        return;
      }

      if (!j2?.url) {
        setError("Stripe Checkout: URL manquante.");
        setLoading(false);
        return;
      }

      window.location.assign(j2.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  const resumePayment = async () => {
    setError(null);

    if (!pending) return;

    if (pendingExpired) {
      window.location.href = `/payment/expired?bookingId=${encodeURIComponent(
        pending.bookingId
      )}&parkingId=${encodeURIComponent(parkingId)}`;
      return;
    }

    setLoading(true);
    try {
      const res2 = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: pending.bookingId,
          parkingTitle,
          amountChf: amountChf || undefined,
          currency: "chf",
        }),
      });

      const j2 = await res2.json().catch(() => ({}));
      if (!res2.ok) {
        setError(j2?.error ?? `Erreur Stripe checkout (${res2.status})`);
        setLoading(false);
        return;
      }

      if (!j2?.url) {
        setError("Stripe Checkout: URL manquante.");
        setLoading(false);
        return;
      }

      window.location.assign(j2.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  const restartFlow = () => {
    clearPending(parkingId);
    setPending(null);
    setError(null);
  };

  return (
    <form onSubmit={onPay} className="space-y-4">
      {/* Bloc pending */}
      {pending ? (
        <div className="border rounded p-3 text-sm space-y-2">
          {!pendingExpired ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">⏳ Paiement en cours</div>
                <div className="text-xs text-gray-600">
                  expire dans <b>{formatMmSs(pendingRemainingMs)}</b>
                </div>
              </div>

              <div className="text-xs text-gray-600">
                Si tu as fermé Stripe par erreur, tu peux reprendre.
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={UI.btnPrimary}
                  onClick={resumePayment}
                  disabled={!ready || !session || loading}
                  title={!session ? "Connecte-toi d’abord" : ""}
                >
                  {loading ? "…" : "Reprendre le paiement"}
                </button>

                <button
                  type="button"
                  className={UI.btnGhost}
                  onClick={restartFlow}
                  disabled={loading}
                >
                  Recommencer
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">⚠️ Paiement expiré</div>
              <div className="text-xs text-gray-600">
                La réservation a été libérée. Tu peux relancer.
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  className={UI.btnPrimary}
                  href={`/payment/expired?bookingId=${encodeURIComponent(
                    pending.bookingId
                  )}&parkingId=${encodeURIComponent(parkingId)}`}
                >
                  Réessayer
                </Link>

                <button
                  type="button"
                  className={UI.btnGhost}
                  onClick={restartFlow}
                >
                  Recommencer
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Dates */}
      <div className="grid gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Début</label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            required
            className="w-full border rounded px-4 py-3 text-base"
            style={{ minHeight: 48 }}
            disabled={isLockedByPending}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Fin</label>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => onEndChange(e.target.value)}
            required
            className="w-full border rounded px-4 py-3 text-base"
            style={{ minHeight: 48 }}
            disabled={isLockedByPending}
          />
        </div>
      </div>

      {/* Estimation + dispo */}
      <div className="border rounded p-3 text-sm text-gray-700 space-y-2">
        <div className="flex flex-wrap justify-between gap-2">
          <span>Estimation :</span>
          <b>{amountChf > 0 ? `${amountChf} CHF` : "—"}</b>
        </div>

        <div className="text-xs text-gray-500">
          {priceDay
            ? `Tarif: ${priceHour} CHF/h ou ${priceDay} CHF/j`
            : `Tarif: ${priceHour} CHF/h`}
        </div>

        {parsed.valid && (
          <div className="text-sm">
            {availability.state === "checking" && (
              <span className="text-gray-600">Vérification disponibilité…</span>
            )}
            {availability.state === "available" && (
              <span className="text-green-700 font-medium">✅ Disponible</span>
            )}
            {availability.state === "unavailable" && (
              <span className="text-red-700 font-medium">
                ❌ Déjà réservé sur ce créneau
              </span>
            )}
            {availability.state === "error" && (
              <span className="text-red-700">
                Erreur disponibilité : {availability.message}
              </span>
            )}
          </div>
        )}

        {!session && ready && (
          <div className="text-xs text-gray-600">
            Connecte-toi pour payer et réserver.
          </div>
        )}

        {start && end && !parsed.valid && (
          <div className="text-xs text-red-600">
            Dates invalides : la fin doit être après le début.
          </div>
        )}

        {isLockedByPending && (
          <div className="text-xs text-gray-600">
            ⏳ Paiement en cours : les dates sont verrouillées.
          </div>
        )}
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
            : isLockedByPending
            ? "Paiement en cours"
            : availability.state !== "available"
            ? "Créneau indisponible"
            : ""
        }
      >
        {loading ? "Redirection…" : "Payer et réserver"}
      </button>

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}
    </form>
  );
}
