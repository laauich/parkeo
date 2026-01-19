// app/my-parkings/[id]/availability/availability-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type DayKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type AvailabilityRow = {
  id: string;
  parking_id: string;
  weekday: DayKey;
  start_time: string; // "HH:MM:SS" ou "HH:MM"
  end_time: string;
  enabled: boolean;
};

type SlotDraft = {
  id: string; // uuid local
  weekday: DayKey;
  start_time: string; // "HH:MM"
  end_time: string;
  enabled: boolean;
  _deleted?: boolean;
  _isNew?: boolean;
};

const DAYS: Array<{ key: DayKey; label: string; short: string }> = [
  { key: 1, label: "Lundi", short: "Lun" },
  { key: 2, label: "Mardi", short: "Mar" },
  { key: 3, label: "Mercredi", short: "Mer" },
  { key: 4, label: "Jeudi", short: "Jeu" },
  { key: 5, label: "Vendredi", short: "Ven" },
  { key: 6, label: "Samedi", short: "Sam" },
  { key: 7, label: "Dimanche", short: "Dim" },
];

function toHHMM(t: string) {
  if (!t) return "09:00";
  const s = t.trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return "09:00";
}

function isValidRange(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return false;
  return eh * 60 + em > sh * 60 + sm;
}

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }) {
  const toMin = (x: string) => {
    const [h, m] = x.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(a.start) < toMin(b.end) && toMin(a.end) > toMin(b.start);
}

export default function AvailabilityClient({ parkingId }: { parkingId: string }) {
  const { ready, session, supabase } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotDraft[]>([]);

  const load = async () => {
    if (!ready) return;
    if (!session) {
      setLoading(false);
      setSlots([]);
      return;
    }

    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("parking_availability")
      .select("id,parking_id,weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingId)
      .order("weekday", { ascending: true });

    if (error) {
      setErr(error.message);
      setSlots([]);
      setLoading(false);
      return;
    }

    const mapped = ((data ?? []) as AvailabilityRow[]).map((r) => ({
      id: r.id,
      weekday: r.weekday,
      start_time: toHHMM(r.start_time),
      end_time: toHHMM(r.end_time),
      enabled: !!r.enabled,
    }));

    setSlots(mapped);
    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  const byDay = useMemo(() => {
    const map: Record<number, SlotDraft[]> = {};
    for (const d of DAYS) map[d.key] = [];
    for (const s of slots) {
      if (s._deleted) continue;
      map[s.weekday].push(s);
    }
    for (const d of DAYS) {
      map[d.key].sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map as Record<DayKey, SlotDraft[]>;
  }, [slots]);

  const enabledCount = useMemo(() => {
    return slots.filter((s) => !s._deleted && s.enabled).length;
  }, [slots]);

  const addSlot = (weekday: DayKey) => {
    setErr(null);
    setOkMsg(null);
    setSlots((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        weekday,
        start_time: "09:00",
        end_time: "18:00",
        enabled: true,
        _isNew: true,
      },
    ]);
  };

  const updateSlot = (id: string, patch: Partial<SlotDraft>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const deleteSlot = (id: string) => {
    setOkMsg(null);
    setErr(null);
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, _deleted: true } : s))
    );
  };

  const validateAll = () => {
    // 1) ranges valides
    const active = slots.filter((s) => !s._deleted && s.enabled);

    for (const s of active) {
      if (!isValidRange(s.start_time, s.end_time)) {
        return `Plage invalide (${DAYS.find((d) => d.key === s.weekday)?.label}) : ${s.start_time} → ${s.end_time}`;
      }
    }

    // 2) pas de chevauchement par jour
    for (const d of DAYS) {
      const daySlots = active
        .filter((s) => s.weekday === d.key)
        .map((s) => ({ id: s.id, start: s.start_time, end: s.end_time }));

      for (let i = 0; i < daySlots.length; i++) {
        for (let j = i + 1; j < daySlots.length; j++) {
          if (overlaps(daySlots[i], daySlots[j])) {
            return `Chevauchement ${d.label} : ${daySlots[i].start}-${daySlots[i].end} chevauche ${daySlots[j].start}-${daySlots[j].end}`;
          }
        }
      }
    }

    return null;
  };

  const save = async () => {
    if (!session) return;

    setErr(null);
    setOkMsg(null);

    const v = validateAll();
    if (v) {
      setErr(v);
      return;
    }

    setSaving(true);

    try {
      // 1) supprimer ceux marqués _deleted (uniquement s’ils existent en DB)
      const toDelete = slots.filter((s) => s._deleted && !s._isNew).map((s) => s.id);
      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from("parking_availability")
          .delete()
          .in("id", toDelete)
          .eq("parking_id", parkingId);

        if (delErr) throw new Error(delErr.message);
      }

      // 2) upsert le reste (non deleted)
      const toUpsert = slots
        .filter((s) => !s._deleted)
        .map((s) => ({
          id: s.id,
          parking_id: parkingId,
          weekday: s.weekday,
          start_time: `${s.start_time}:00`,
          end_time: `${s.end_time}:00`,
          enabled: !!s.enabled,
        }));

      if (toUpsert.length) {
        const { error: upErr } = await supabase
          .from("parking_availability")
          .upsert(toUpsert, { onConflict: "id" });

        if (upErr) throw new Error(upErr.message);
      }

      setOkMsg(
        enabledCount > 0
          ? "✅ Planning sauvegardé."
          : "✅ Sauvegardé. (Aucun créneau actif : fallback = place réservable comme avant)"
      );

      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  const topBanner = (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-4">
      <div
        className={[
          "absolute inset-0 -z-10 opacity-70",
          "bg-gradient-to-r from-violet-200/60 via-white/30 to-violet-200/60",
        ].join(" ")}
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="font-semibold text-slate-900">Horaires de disponibilité</div>
          <div className="text-sm text-slate-600">
            Active des créneaux par jour. Tu peux en mettre plusieurs (ex: 08:00–12:00 puis 14:00–19:00).
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={UI.chip}>
            Créneaux actifs : <b className="ml-1">{enabledCount}</b>
          </span>
          <button
            type="button"
            className={`${UI.btnBase} ${UI.btnPrimary}`}
            onClick={() => void save()}
            disabled={saving || !session}
          >
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );

  if (!ready) {
    return <p className={UI.p}>Chargement…</p>;
  }

  if (!session) {
    return <p className={UI.p}>Connecte-toi pour modifier le planning.</p>;
  }

  return (
    <div className="space-y-4">
      {topBanner}

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

      {loading ? (
        <div className={`${UI.card} ${UI.cardPad}`}>
          <p className={UI.p}>Chargement du planning…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {DAYS.map((d) => {
            const daySlots = byDay[d.key];

            return (
              <div key={d.key} className={`${UI.card} ${UI.cardPad} space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-violet-600/10 text-violet-700 font-semibold">
                      {d.short}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{d.label}</div>
                      <div className={UI.subtle}>
                        {daySlots.filter((s) => s.enabled).length} actif(s)
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`${UI.btnBase} ${UI.btnGhost}`}
                    onClick={() => addSlot(d.key)}
                  >
                    + Ajouter
                  </button>
                </div>

                {daySlots.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-3 text-sm text-slate-600">
                    Aucun créneau. Clique “Ajouter”.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur p-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="accent-violet-600"
                              checked={s.enabled}
                              onChange={(e) => updateSlot(s.id, { enabled: e.target.checked })}
                            />
                            Actif
                          </label>

                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="time"
                              className={UI.input}
                              value={s.start_time}
                              onChange={(e) => updateSlot(s.id, { start_time: e.target.value })}
                            />
                            <span className="text-slate-400">→</span>
                            <input
                              type="time"
                              className={UI.input}
                              value={s.end_time}
                              onChange={(e) => updateSlot(s.id, { end_time: e.target.value })}
                            />
                          </div>

                          <button
                            type="button"
                            className={`${UI.btnBase} ${UI.btnDanger}`}
                            onClick={() => deleteSlot(s.id)}
                          >
                            Supprimer
                          </button>
                        </div>

                        {!isValidRange(s.start_time, s.end_time) ? (
                          <div className="mt-2 text-xs text-rose-700">
                            Plage invalide (fin doit être après début).
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2 text-xs text-slate-500">
        Astuce : si tu veux rendre une période “non réservable” ponctuellement (vacances, travaux), utilise les <b>blackouts</b> (parking_blackouts).
      </div>
    </div>
  );
}
