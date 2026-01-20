"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type Slot = {
  weekday: number; // 1..7
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  enabled: boolean;
};

const DAYS: Array<{ weekday: number; label: string; short: string }> = [
  { weekday: 1, label: "Lundi", short: "Lun" },
  { weekday: 2, label: "Mardi", short: "Mar" },
  { weekday: 3, label: "Mercredi", short: "Mer" },
  { weekday: 4, label: "Jeudi", short: "Jeu" },
  { weekday: 5, label: "Vendredi", short: "Ven" },
  { weekday: 6, label: "Samedi", short: "Sam" },
  { weekday: 7, label: "Dimanche", short: "Dim" },
];

function defaultSlots(): Slot[] {
  return DAYS.map((d) => ({
    weekday: d.weekday,
    start_time: "08:00",
    end_time: "18:00",
    enabled: d.weekday <= 5,
  }));
}

function presetOffice(): Slot[] {
  return DAYS.map((d) => ({
    weekday: d.weekday,
    start_time: "08:00",
    end_time: "18:00",
    enabled: d.weekday <= 5,
  }));
}

function presetEvening(): Slot[] {
  return DAYS.map((d) => ({
    weekday: d.weekday,
    start_time: "18:00",
    end_time: "23:00",
    enabled: true,
  }));
}

function presetAllDay(): Slot[] {
  return DAYS.map((d) => ({
    weekday: d.weekday,
    start_time: "00:00",
    end_time: "23:59",
    enabled: true,
  }));
}

function isTimeHHMM(v: string) {
  return /^\d{2}:\d{2}$/.test(v);
}

function isValidParkingId(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  if (s === "undefined" || s === "null") return false;
  return true;
}

type GetRespOk = { ok: true; slots: Slot[] };
type RespErr = { ok: false; error: string; detail?: string };

export default function ParkingAvailabilityPlanner({ parkingId }: { parkingId: string }) {
  const { ready, session } = useAuth();

  const [slots, setSlots] = useState<Slot[]>(defaultSlots());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const authHeader = useMemo(() => {
    const t = session?.access_token;
    return t ? { Authorization: `Bearer ${t}` } : null;
  }, [session?.access_token]);

  const setSlot = (weekday: number, patch: Partial<Slot>) => {
    setSlots((prev) => prev.map((s) => (s.weekday === weekday ? { ...s, ...patch, weekday } : s)));
  };

  const copyToAll = (weekday: number) => {
    const src = slots.find((s) => s.weekday === weekday);
    if (!src) return;
    setSlots((prev) =>
      prev.map((s) => ({
        ...s,
        start_time: src.start_time,
        end_time: src.end_time,
        enabled: src.enabled,
      }))
    );
  };

  const validate = (): string | null => {
    for (const s of slots) {
      if (s.weekday < 1 || s.weekday > 7) return "weekday invalide";
      if (!isTimeHHMM(s.start_time) || !isTimeHHMM(s.end_time)) return "Heures invalides";
      if (s.enabled && s.end_time <= s.start_time) return "end_time doit être après start_time";
    }
    return null;
  };

  const load = async () => {
    if (!authHeader) return;

    // ✅ IMPORTANT: guard AVANT setLoading(true)
    if (!isValidParkingId(parkingId)) {
      setErr(`parkingId manquant (reçu="${String(parkingId)}")`);
      return;
    }

    setLoading(true);
    setErr(null);
    setOkMsg(null);

    try {
      const url = `/api/owner/availability/get?parkingId=${encodeURIComponent(parkingId.trim())}`;
      const res = await fetch(url, { headers: authHeader });

      const jsonUnknown: unknown = await res.json().catch(() => ({} as unknown));
      const json = jsonUnknown as GetRespOk | RespErr;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg = "error" in json ? json.error : `Erreur (${res.status})`;
        const detail = "detail" in json ? json.detail : undefined;
        setErr(detail ? `${msg} — ${detail}` : msg);
        return;
      }

      const map = new Map<number, Slot>();
      for (const s of json.slots ?? []) map.set(s.weekday, s);

      if (map.size === 0) {
        setSlots(defaultSlots());
        return;
      }

      setSlots(
        DAYS.map((d) => {
          const found = map.get(d.weekday);
          return found
            ? {
                weekday: d.weekday,
                start_time: found.start_time,
                end_time: found.end_time,
                enabled: Boolean(found.enabled),
              }
            : { weekday: d.weekday, start_time: "08:00", end_time: "18:00", enabled: false };
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!authHeader) return;

    // ✅ IMPORTANT: guard AVANT setSaving(true)
    if (!isValidParkingId(parkingId)) {
      setErr(`parkingId manquant (reçu="${String(parkingId)}")`);
      return;
    }

    setErr(null);
    setOkMsg(null);

    const v = validate();
    if (v) {
      setErr(v);
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/owner/availability/upsert", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ parkingId: parkingId.trim(), slots }),
      });

      const jsonUnknown: unknown = await res.json().catch(() => ({} as unknown));
      const json = jsonUnknown as { ok?: boolean; error?: string; detail?: string };

      if (!res.ok || !json.ok) {
        const msg = json.error ?? `Erreur (${res.status})`;
        const detail = json.detail;
        setErr(detail ? `${msg} — ${detail}` : msg);
        return;
      }

      setOkMsg("✅ Planning enregistré !");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!ready || !session || !authHeader) return;

    // si parkingId est invalide, on ne spam pas l'API
    if (!isValidParkingId(parkingId)) return;

    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  const enabledCount = useMemo(() => slots.filter((s) => s.enabled).length, [slots]);

  if (!ready) return <p className={UI.p}>Chargement…</p>;
  if (!session) return <p className={UI.p}>Tu dois être connecté.</p>;

  return (
    <div className="space-y-4">
      {err ? (
        <div className={`${UI.card} ${UI.cardPad} border border-rose-200 bg-rose-50/60`}>
          <p className="text-sm text-rose-700">
            <b>Erreur :</b> {err}
          </p>
        </div>
      ) : null}

      {okMsg ? (
        <div className={`${UI.card} ${UI.cardPad} border border-emerald-200 bg-emerald-50/60`}>
          <p className="text-sm text-emerald-800">{okMsg}</p>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className={UI.chip}>
            Jours actifs : <b>{enabledCount}/7</b>
          </span>
          <span className={UI.chip}>Optionnel (fallback si vide)</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => setSlots(presetOffice())}>
            Bureau
          </button>
          <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => setSlots(presetEvening())}>
            Soir
          </button>
          <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => setSlots(presetAllDay())}>
            24/7
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {DAYS.map((d) => {
          const s =
            slots.find((x) => x.weekday === d.weekday) ?? ({
              weekday: d.weekday,
              start_time: "08:00",
              end_time: "18:00",
              enabled: false,
            } satisfies Slot);

          return (
            <div
              key={d.weekday}
              className={[
                "rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur",
                "p-4 sm:p-5",
                "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4",
              ].join(" ")}
            >
              <div className="flex items-center justify-between sm:w-[240px]">
                <div className="flex items-center gap-3">
                  <div
                    className={[
                      "w-10 h-10 rounded-2xl flex items-center justify-center font-semibold",
                      s.enabled ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700",
                    ].join(" ")}
                  >
                    {d.short}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{d.label}</div>
                    <div className="text-xs text-slate-500">{s.enabled ? "Disponible" : "Fermé"}</div>
                  </div>
                </div>

                <button
                  type="button"
                  className={`${UI.btnBase} ${UI.btnGhost} px-3 py-2 rounded-full`}
                  onClick={() => setSlot(d.weekday, { enabled: !s.enabled })}
                >
                  {s.enabled ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-14">Début</span>
                  <input
                    type="time"
                    className={UI.input}
                    value={s.start_time}
                    onChange={(e) => setSlot(d.weekday, { start_time: e.target.value })}
                    disabled={!s.enabled}
                  />
                </div>

                <div className="hidden sm:block text-slate-400">→</div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-14">Fin</span>
                  <input
                    type="time"
                    className={UI.input}
                    value={s.end_time}
                    onChange={(e) => setSlot(d.weekday, { end_time: e.target.value })}
                    disabled={!s.enabled}
                  />
                </div>

                <div className="sm:ml-auto">
                  <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => copyToAll(d.weekday)}>
                    Copier → Tous
                  </button>
                </div>
              </div>

              <div className="sm:w-[180px]">
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200/70">
                  <div
                    className={["h-full", s.enabled ? "bg-violet-600/70" : "bg-slate-300/60"].join(" ")}
                    style={{ width: s.enabled ? "100%" : "25%" }}
                  />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {s.enabled ? `${s.start_time} → ${s.end_time}` : "Désactivé"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" className={`${UI.btnBase} ${UI.btnPrimary}`} onClick={() => void save()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => void load()} disabled={loading}>
          {loading ? "…" : "Recharger"}
        </button>
      </div>
    </div>
  );
}
