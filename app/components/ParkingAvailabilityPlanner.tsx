// app/components/ParkingAvailabilityPlanner.tsx
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

// ✅ Ce que renvoie l’API /api/owner/availability/get (souvent start_time/end_time = "HH:MM:SS")
type SlotApi = {
  weekday: number;
  start_time: string;
  end_time: string;
  enabled: boolean;
};

type ApiOk = { ok: true; slots: SlotApi[] };
type ApiErr = { ok: false; error: string };

const DAYS: Array<{ weekday: number; label: string; short: string }> = [
  { weekday: 1, label: "Lundi", short: "Lun" },
  { weekday: 2, label: "Mardi", short: "Mar" },
  { weekday: 3, label: "Mercredi", short: "Mer" },
  { weekday: 4, label: "Jeudi", short: "Jeu" },
  { weekday: 5, label: "Vendredi", short: "Ven" },
  { weekday: 6, label: "Samedi", short: "Sam" },
  { weekday: 7, label: "Dimanche", short: "Dim" },
];

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

// ✅ Normalise "HH:MM:SS" -> "HH:MM"
function toHHMM(t: unknown): string {
  if (typeof t !== "string") return "08:00";
  const s = t.trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return "08:00";
}

// ✅ Tolérant pour validation: HH:MM ou HH:MM:SS
function isTimeOk(v: string) {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(v);
}

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

function normalizeSlotsFromApi(apiSlots: SlotApi[]): Slot[] {
  const map = new Map<number, Slot>();

  for (const s of apiSlots ?? []) {
    const wd = Number(s.weekday);
    if (!Number.isFinite(wd)) continue;

    map.set(wd, {
      weekday: wd,
      start_time: toHHMM(s.start_time),
      end_time: toHHMM(s.end_time),
      enabled: Boolean(s.enabled),
    });
  }

  // ✅ si rien en DB => defaults
  if (map.size === 0) return defaultSlots();

  // ✅ Always return 7 days
  return DAYS.map((d) => {
    const found = map.get(d.weekday);
    return found
      ? found
      : { weekday: d.weekday, start_time: "08:00", end_time: "18:00", enabled: false };
  });
}

function isApiOk(x: unknown): x is ApiOk {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.ok !== true) return false;
  if (!Array.isArray(o.slots)) return false;
  return true;
}

function isApiErr(x: unknown): x is ApiErr {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.ok === false && typeof o.error === "string";
}

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

  const parkingIdSafe = useMemo(() => String(parkingId ?? "").trim(), [parkingId]);
  const parkingReady = useMemo(() => isUuid(parkingIdSafe), [parkingIdSafe]);

  const setSlot = (weekday: number, patch: Partial<Slot>) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.weekday === weekday
          ? {
              ...s,
              ...patch,
              weekday,
              start_time: patch.start_time ? toHHMM(patch.start_time) : s.start_time,
              end_time: patch.end_time ? toHHMM(patch.end_time) : s.end_time,
            }
          : s
      )
    );
  };

  const copyToAll = (weekday: number) => {
    const src = slots.find((s) => s.weekday === weekday);
    if (!src) return;

    setSlots((prev) =>
      prev.map((s) => ({
        ...s,
        start_time: toHHMM(src.start_time),
        end_time: toHHMM(src.end_time),
        enabled: src.enabled,
      }))
    );
  };

  const validate = (): string | null => {
    for (const s of slots) {
      if (s.weekday < 1 || s.weekday > 7) return "weekday invalide";
      if (!isTimeOk(s.start_time) || !isTimeOk(s.end_time)) return "Heures invalides.";

      const st = toHHMM(s.start_time);
      const en = toHHMM(s.end_time);

      if (s.enabled && en <= st) return "end_time doit être après start_time";
    }
    return null;
  };

  const load = async () => {
    if (!authHeader) return;
    if (!parkingReady) {
      setErr(null);
      setOkMsg(null);
      return;
    }

    setLoading(true);
    setErr(null);
    setOkMsg(null);

    try {
      const url = `/api/owner/availability/get?parkingId=${encodeURIComponent(parkingIdSafe)}`;
      const res = await fetch(url, { headers: authHeader });
      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = isApiErr(json) ? json.error : `Erreur (${res.status})`;
        setErr(msg);
        setLoading(false);
        return;
      }

      if (isApiOk(json)) {
        setSlots(normalizeSlotsFromApi(json.slots ?? []));
        setLoading(false);
        return;
      }

      if (isApiErr(json)) {
        setErr(json.error);
        setLoading(false);
        return;
      }

      setErr("Réponse API inattendue");
      setLoading(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur chargement planning");
      setLoading(false);
    }
  };

  const save = async () => {
    if (!authHeader) return;

    if (!parkingReady) {
      setErr("parkingId invalide (la place n’est pas encore chargée)");
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
      // ✅ on envoie toujours HH:MM
      const payloadSlots: Slot[] = slots.map((s) => ({
        weekday: s.weekday,
        start_time: toHHMM(s.start_time),
        end_time: toHHMM(s.end_time),
        enabled: !!s.enabled,
      }));

      const res = await fetch("/api/owner/availability/upsert", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ parkingId: parkingIdSafe, slots: payloadSlots }),
      });

      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in (json as Record<string, unknown>) &&
          typeof (json as Record<string, unknown>).error === "string"
            ? String((json as Record<string, unknown>).error)
            : `Erreur (${res.status})`;
        setErr(msg);
        setSaving(false);
        return;
      }

      const ok =
        json && typeof json === "object" && "ok" in (json as Record<string, unknown>)
          ? Boolean((json as Record<string, unknown>).ok)
          : false;

      if (!ok) {
        const msg =
          json && typeof json === "object" && "error" in (json as Record<string, unknown>) &&
          typeof (json as Record<string, unknown>).error === "string"
            ? String((json as Record<string, unknown>).error)
            : "Erreur enregistrement planning";
        setErr(msg);
        setSaving(false);
        return;
      }

      setOkMsg("✅ Planning enregistré !");
      setSaving(false);

      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur enregistrement planning");
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!ready || !session || !authHeader) return;
    if (!parkingId || !isUuid(parkingId)) return;
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  const enabledCount = useMemo(() => slots.filter((s) => s.enabled).length, [slots]);

  if (!ready) return <p className={UI.p}>Chargement…</p>;
  if (!session) return <p className={UI.p}>Tu dois être connecté.</p>;

  if (!parkingReady) {
    return (
      <div className={`${UI.card} ${UI.cardPad} border border-amber-200 bg-amber-50/60`}>
        <p className="text-sm text-slate-800">
          ⏳ Chargement de la place… (planning indisponible tant que l’ID n’est pas prêt)
        </p>
      </div>
    );
  }

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
            slots.find((x) => x.weekday === d.weekday) ?? {
              weekday: d.weekday,
              start_time: "08:00",
              end_time: "18:00",
              enabled: false,
            };

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
                    value={toHHMM(s.start_time)}
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
                    value={toHHMM(s.end_time)}
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
                  {s.enabled ? `${toHHMM(s.start_time)} → ${toHHMM(s.end_time)}` : "Désactivé"}
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
