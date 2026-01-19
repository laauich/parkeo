// app/components/ParkingAvailabilityPlanner.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { UI } from "@/app/components/ui";
import { useAuth } from "@/app/providers/AuthProvider";

type Slot = {
  weekday: number; // 1..7
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  enabled: boolean;
};

type ApiGetOk = { ok: true; parkingId: string; slots: Array<{ weekday: number; start_time: string; end_time: string; enabled: boolean }> };
type ApiErr = { ok: false; error: string; detail?: string };
type ApiGetResp = ApiGetOk | ApiErr;

const DAYS: Array<{ k: number; label: string; short: string }> = [
  { k: 1, label: "Lundi", short: "Lun" },
  { k: 2, label: "Mardi", short: "Mar" },
  { k: 3, label: "Mercredi", short: "Mer" },
  { k: 4, label: "Jeudi", short: "Jeu" },
  { k: 5, label: "Vendredi", short: "Ven" },
  { k: 6, label: "Samedi", short: "Sam" },
  { k: 7, label: "Dimanche", short: "Dim" },
];

function normalizeToHHmm(t: string) {
  const s = (t ?? "").trim();
  // "HH:mm:ss" => "HH:mm"
  if (/^\d\d:\d\d:\d\d$/.test(s)) return s.slice(0, 5);
  if (/^\d\d:\d\d$/.test(s)) return s;
  return "09:00";
}

function minutes(hhmm: string) {
  const [hh, mm] = hhmm.split(":");
  return Number(hh) * 60 + Number(mm);
}

function isValidHHmm(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export default function ParkingAvailabilityPlanner(props: { parkingId: string; compact?: boolean }) {
  const { parkingId, compact } = props;
  const { ready, session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // state = slots groupés par weekday
  const [byDay, setByDay] = useState<Record<number, Slot[]>>(() => {
    const init: Record<number, Slot[]> = {};
    for (const d of DAYS) init[d.k] = [];
    return init;
  });

  const totalEnabledSlots = useMemo(() => {
    return Object.values(byDay).flat().filter((s) => s.enabled).length;
  }, [byDay]);

  const load = async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/owner/availability?parkingId=${encodeURIComponent(parkingId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = (await res.json().catch(() => ({}))) as ApiGetResp;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg = "error" in json ? json.error : `Erreur (${res.status})`;
        const detail = "detail" in json ? json.detail : undefined;
        setErr(detail ? `${msg} — ${detail}` : msg);
        setLoading(false);
        return;
      }

      const next: Record<number, Slot[]> = {};
      for (const d of DAYS) next[d.k] = [];

      for (const r of json.slots ?? []) {
        const w = r.weekday;
        if (!next[w]) next[w] = [];
        next[w].push({
          weekday: w,
          start_time: normalizeToHHmm(r.start_time),
          end_time: normalizeToHHmm(r.end_time),
          enabled: !!r.enabled,
        });
      }

      // tri
      for (const d of DAYS) {
        next[d.k].sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
      }

      setByDay(next);
      setLoading(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  const setDayEnabled = (weekday: number, enabled: boolean) => {
    setOkMsg(null);
    setErr(null);

    setByDay((prev) => {
      const cur = prev[weekday] ?? [];
      if (!enabled) {
        // désactiver = on garde les slots mais enabled=false (pratique) OU on vide
        // ici: on garde mais disabled
        const next = cur.map((s) => ({ ...s, enabled: false }));
        return { ...prev, [weekday]: next };
      }

      // activer: s'il n'y a rien, on propose un slot par défaut
      if (cur.length === 0) {
        return {
          ...prev,
          [weekday]: [{ weekday, start_time: "09:00", end_time: "18:00", enabled: true }],
        };
      }

      // sinon, on remet enabled=true sur tous
      return { ...prev, [weekday]: cur.map((s) => ({ ...s, enabled: true })) };
    });
  };

  const addSlot = (weekday: number) => {
    setOkMsg(null);
    setErr(null);

    setByDay((prev) => {
      const cur = prev[weekday] ?? [];
      const next = [
        ...cur,
        { weekday, start_time: "09:00", end_time: "18:00", enabled: true },
      ];
      return { ...prev, [weekday]: next };
    });
  };

  const removeSlot = (weekday: number, idx: number) => {
    setOkMsg(null);
    setErr(null);

    setByDay((prev) => {
      const cur = prev[weekday] ?? [];
      const next = cur.filter((_, i) => i !== idx);
      return { ...prev, [weekday]: next };
    });
  };

  const updateSlot = (weekday: number, idx: number, patch: Partial<Slot>) => {
    setOkMsg(null);
    setErr(null);

    setByDay((prev) => {
      const cur = prev[weekday] ?? [];
      const next = cur.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      return { ...prev, [weekday]: next };
    });
  };

  const buildPayload = (): Slot[] => {
    const all = Object.values(byDay).flat();
    // On envoie tout (enabled true/false). Le serveur supprime + recrée
    // -> on peut filtrer pour ne garder que enabled=true si tu préfères.
    return all;
  };

  const validateClient = (): string | null => {
    const all = buildPayload();
    for (const s of all) {
      if (!isValidHHmm(s.start_time) || !isValidHHmm(s.end_time)) return "Heures invalides";
      if (minutes(s.end_time) <= minutes(s.start_time)) return "Un créneau a une fin avant le début";
      if (s.weekday < 1 || s.weekday > 7) return "weekday invalide";
    }
    return null;
  };

  const save = async () => {
    if (!session) return;

    const msg = validateClient();
    if (msg) {
      setErr(msg);
      return;
    }

    setSaving(true);
    setErr(null);
    setOkMsg(null);

    try {
      const res = await fetch("/api/owner/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ parkingId, slots: buildPayload() }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string };

      if (!res.ok || !json.ok) {
        const msg2 = json.error ?? `Erreur save (${res.status})`;
        const detail = json.detail;
        setErr(detail ? `${msg2} — ${detail}` : msg2);
        setSaving(false);
        return;
      }

      setOkMsg("Planning enregistré ✅");
      setSaving(false);
      // reload pour normaliser l’ordre
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
      setSaving(false);
    }
  };

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
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-900">Planning de disponibilité</div>
          <div className={UI.subtle}>
            Définis quand la place peut être louée. Si aucun planning n’est défini, le comportement reste “libre” (fallback).
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={UI.chip}>
            Slots actifs : <b className="ml-1">{totalEnabledSlots}</b>
          </span>
          <button
            type="button"
            className={`${UI.btnBase} ${UI.btnGhost}`}
            onClick={() => void load()}
            disabled={loading || saving}
          >
            {loading ? "…" : "Rafraîchir"}
          </button>
          <button
            type="button"
            className={`${UI.btnBase} ${UI.btnPrimary}`}
            onClick={() => void save()}
            disabled={loading || saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {err ? (
        <div className={`${UI.card} ${UI.cardPad} border-rose-200`}>
          <p className="text-sm text-rose-700">Erreur : {err}</p>
        </div>
      ) : null}

      {okMsg ? (
        <div className={`${UI.card} ${UI.cardPad} border-emerald-200 bg-emerald-50/60`}>
          <p className="text-sm text-emerald-800">{okMsg}</p>
        </div>
      ) : null}

      {loading ? (
        <div className={`${UI.card} ${UI.cardPad}`}>
          <p className={UI.p}>Chargement du planning…</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {DAYS.map((d) => {
            const slots = byDay[d.k] ?? [];
            const dayEnabled = slots.some((s) => s.enabled);

            return (
              <div key={d.k} className={`${UI.card} ${UI.cardPad} space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-violet-600/10 text-violet-700 font-semibold">
                      {d.short}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{d.label}</div>
                      <div className={UI.subtle}>
                        {dayEnabled ? "Disponible" : "Non disponible"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`${UI.btnBase} ${dayEnabled ? UI.btnGhost : UI.btnPrimary} ${UI.btnSm}`}
                    onClick={() => setDayEnabled(d.k, !dayEnabled)}
                  >
                    {dayEnabled ? "Désactiver" : "Activer"}
                  </button>
                </div>

                <div className={UI.divider} />

                {slots.length === 0 ? (
                  <div className="text-sm text-slate-600">
                    Aucun créneau. Active la journée pour ajouter un créneau.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {slots.map((s, idx) => (
                      <div
                        key={`${d.k}-${idx}`}
                        className="rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            className={UI.input}
                            value={s.start_time}
                            onChange={(e) => updateSlot(d.k, idx, { start_time: e.target.value })}
                            disabled={!s.enabled}
                          />
                          <span className="text-slate-500">→</span>
                          <input
                            type="time"
                            className={UI.input}
                            value={s.end_time}
                            onChange={(e) => updateSlot(d.k, idx, { end_time: e.target.value })}
                            disabled={!s.enabled}
                          />
                        </div>

                        <div className="flex items-center gap-2 sm:ml-auto">
                          <button
                            type="button"
                            className={`${UI.btnBase} ${s.enabled ? UI.btnGhost : UI.btnPrimary} ${UI.btnSm}`}
                            onClick={() => updateSlot(d.k, idx, { enabled: !s.enabled })}
                          >
                            {s.enabled ? "Off" : "On"}
                          </button>

                          <button
                            type="button"
                            className={`${UI.btnBase} ${UI.btnDanger} ${UI.btnSm}`}
                            onClick={() => removeSlot(d.k, idx)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      className={`${UI.btnBase} ${UI.btnGhost} w-full`}
                      onClick={() => addSlot(d.k)}
                    >
                      + Ajouter un créneau
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
