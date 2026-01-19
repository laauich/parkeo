// app/components/ParkingAvailabilityPlanner.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type Tone = "success" | "warning" | "danger" | "info";

type DayKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Slot = {
  weekday: DayKey; // 1=lun ... 7=dim
  enabled: boolean;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
};

type ApiGetOk = { ok: true; slots: Slot[] };
type ApiGetErr = { ok: false; error: string; detail?: string };
type ApiGetResp = ApiGetOk | ApiGetErr;

type ApiPostOk = { ok: true };
type ApiPostErr = { ok: false; error: string; detail?: string };
type ApiPostResp = ApiPostOk | ApiPostErr;

const DAYS: Array<{ key: DayKey; label: string }> = [
  { key: 1, label: "Lun" },
  { key: 2, label: "Mar" },
  { key: 3, label: "Mer" },
  { key: 4, label: "Jeu" },
  { key: 5, label: "Ven" },
  { key: 6, label: "Sam" },
  { key: 7, label: "Dim" },
];

function defaultSlot(weekday: DayKey): Slot {
  return {
    weekday,
    enabled: false,
    start_time: "08:00",
    end_time: "20:00",
  };
}

function clampTime(t: string): string {
  // attend "HH:MM" (ou "HH:MM:SS" -> on tronque)
  const s = t.trim();
  if (!s) return "00:00";
  const parts = s.split(":");
  const hh = Number(parts[0] ?? "0");
  const mm = Number(parts[1] ?? "0");
  const H = Number.isFinite(hh) ? Math.min(23, Math.max(0, hh)) : 0;
  const M = Number.isFinite(mm) ? Math.min(59, Math.max(0, mm)) : 0;
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

function minutes(t: string): number {
  const [hh, mm] = t.split(":");
  const h = Number(hh ?? "0");
  const m = Number(mm ?? "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function badge(tone: Tone, text: string) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {text}
    </span>
  );
}

export default function ParkingAvailabilityPlanner({ parkingId }: { parkingId: string }) {
  const { ready, session } = useAuth();

  const [slots, setSlots] = useState<Record<DayKey, Slot>>(() => ({
    1: defaultSlot(1),
    2: defaultSlot(2),
    3: defaultSlot(3),
    4: defaultSlot(4),
    5: defaultSlot(5),
    6: defaultSlot(6),
    7: defaultSlot(7),
  }));

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null);

  const hasAnyEnabled = useMemo(() => {
    return DAYS.some((d) => slots[d.key].enabled);
  }, [slots]);

  const normalizedPayload = useMemo((): Slot[] => {
    return DAYS.map((d) => {
      const s = slots[d.key];
      const start = clampTime(s.start_time);
      const end = clampTime(s.end_time);
      return {
        weekday: d.key,
        enabled: s.enabled,
        start_time: start,
        end_time: end,
      };
    });
  }, [slots]);

  const validation = useMemo(() => {
    // Valider uniquement les jours enabled
    const bad = normalizedPayload.find((s) => s.enabled && minutes(s.end_time) <= minutes(s.start_time));
    if (bad) {
      return { ok: false as const, text: `Horaire invalide (${DAYS[bad.weekday - 1]?.label ?? "jour"}): fin <= début.` };
    }
    return { ok: true as const, text: "" };
  }, [normalizedPayload]);

  const setDay = (day: DayKey, patch: Partial<Omit<Slot, "weekday">>) => {
    setSlots((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        ...patch,
      },
    }));
  };

  const copyToAll = (fromDay: DayKey) => {
    const src = slots[fromDay];
    setSlots((prev) => {
      const next: Record<DayKey, Slot> = { ...prev };
      for (const d of DAYS) {
        next[d.key] = {
          weekday: d.key,
          enabled: src.enabled,
          start_time: src.start_time,
          end_time: src.end_time,
        };
      }
      return next;
    });
    setMsg({ tone: "info", text: "Créneau copié sur tous les jours." });
  };

  const load = async () => {
    if (!ready) return;
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/owner/availability?parkingId=${encodeURIComponent(parkingId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = (await res.json().catch(() => ({}))) as ApiGetResp;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const errMsg = ("error" in json && json.error) ? json.error : `Erreur (${res.status})`;
        const detail = ("detail" in json && json.detail) ? json.detail : undefined;
        setMsg({ tone: "warning", text: detail ? `${errMsg} — ${detail}` : errMsg });
        // fallback: garder defaults
        setLoading(false);
        return;
      }

      const map: Record<DayKey, Slot> = {
        1: defaultSlot(1),
        2: defaultSlot(2),
        3: defaultSlot(3),
        4: defaultSlot(4),
        5: defaultSlot(5),
        6: defaultSlot(6),
        7: defaultSlot(7),
      };

      for (const s of json.slots) {
        // sécurise weekday
        const wd = s.weekday as number;
        if (wd < 1 || wd > 7) continue;
        const day = wd as DayKey;
        map[day] = {
          weekday: day,
          enabled: !!s.enabled,
          start_time: clampTime(s.start_time),
          end_time: clampTime(s.end_time),
        };
      }

      setSlots(map);
      setLoading(false);
    } catch (e: unknown) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Erreur inconnue (load)" });
      setLoading(false);
    }
  };

  const save = async () => {
    if (!session) return;

    if (!validation.ok) {
      setMsg({ tone: "danger", text: validation.text });
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const res = await fetch("/api/owner/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ parkingId, slots: normalizedPayload }),
      });

      const json = (await res.json().catch(() => ({}))) as ApiPostResp;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const errMsg = ("error" in json && json.error) ? json.error : `Erreur (${res.status})`;
        const detail = ("detail" in json && json.detail) ? json.detail : undefined;
        setMsg({ tone: "danger", text: detail ? `${errMsg} — ${detail}` : errMsg });
        setSaving(false);
        return;
      }

      setMsg({ tone: "success", text: hasAnyEnabled ? "Planning enregistré ✅" : "Planning supprimé (fallback actif) ✅" });
      setSaving(false);
    } catch (e: unknown) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Erreur inconnue (save)" });
      setSaving(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  if (!ready) {
    return (
      <div className={`${UI.card} ${UI.cardPad}`}>
        <p className={UI.p}>Chargement…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`${UI.card} ${UI.cardPad}`}>
        <p className={UI.p}>Connecte-toi pour configurer le planning.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-base font-semibold text-slate-900">Disponibilités hebdomadaires</div>
          <p className={UI.p}>
            Active les jours et définis un créneau. Si aucun jour n’est activé, la place reste disponible (fallback).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {hasAnyEnabled ? badge("success", "Planning actif") : badge("info", "Fallback actif")}
          <button
            type="button"
            className={`${UI.btnBase} ${UI.btnGhost}`}
            onClick={() => void load()}
            disabled={loading || saving}
          >
            {loading ? "…" : "Recharger"}
          </button>
          <button
            type="button"
            className={`${UI.btnBase} ${UI.btnPrimary}`}
            onClick={() => void save()}
            disabled={saving || loading}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {msg ? (
        <div
          className={[
            "rounded-2xl border p-3 text-sm",
            msg.tone === "success"
              ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
              : msg.tone === "warning"
              ? "border-amber-200 bg-amber-50/60 text-amber-800"
              : msg.tone === "danger"
              ? "border-rose-200 bg-rose-50/60 text-rose-800"
              : "border-slate-200 bg-slate-50/60 text-slate-700",
          ].join(" ")}
        >
          {msg.text}
        </div>
      ) : null}

      {/* planning */}
      <div className="grid gap-3">
        {DAYS.map((d) => {
          const s = slots[d.key];
          const invalid = s.enabled && minutes(clampTime(s.end_time)) <= minutes(clampTime(s.start_time));

          return (
            <div key={d.key} className="rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-violet-600/10 text-violet-700 font-semibold">
                    {d.label}
                  </span>

                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-violet-600"
                      checked={s.enabled}
                      onChange={(e) => setDay(d.key, { enabled: e.target.checked })}
                    />
                    Disponible
                  </label>

                  {invalid ? badge("danger", "Fin ≤ début") : null}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">De</span>
                    <input
                      type="time"
                      className={UI.input}
                      value={clampTime(s.start_time)}
                      onChange={(e) => setDay(d.key, { start_time: e.target.value })}
                      disabled={!s.enabled}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">à</span>
                    <input
                      type="time"
                      className={UI.input}
                      value={clampTime(s.end_time)}
                      onChange={(e) => setDay(d.key, { end_time: e.target.value })}
                      disabled={!s.enabled}
                    />
                  </div>

                  <button
                    type="button"
                    className={`${UI.btnBase} ${UI.btnGhost}`}
                    onClick={() => copyToAll(d.key)}
                    disabled={saving || loading}
                    title="Copier ce créneau sur tous les jours"
                  >
                    Copier
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!hasAnyEnabled ? (
        <div className="text-xs text-slate-600">
          Astuce : active au moins un jour pour limiter les réservations aux horaires souhaités.
        </div>
      ) : null}
    </div>
  );
}
