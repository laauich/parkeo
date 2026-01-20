// app/my-parkings/[id]/availability/page.tsx
"use client";

import Link from "next/link";
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
    enabled: d.weekday >= 1 && d.weekday <= 5, // lun-ven
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

export default function AvailabilityPage({ params }: { params: { id: string } }) {
  const parkingId = params.id;
  const { ready, session } = useAuth();

  const [slots, setSlots] = useState<Slot[]>(defaultSlots());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const authHeader = useMemo(() => {
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session?.access_token]);

  const load = async () => {
    if (!authHeader) return;
    setLoading(true);
    setErr(null);
    setOkMsg(null);

    const url = `/api/owner/availability/get?parkingId=${encodeURIComponent(parkingId)}`;
    const res = await fetch(url, { headers: authHeader });
    const json = (await res.json().catch(() => ({}))) as
      | { ok: true; slots: Slot[] }
      | { ok: false; error: string };

    setLoading(false);

    if (!res.ok || !("ok" in json) || json.ok === false) {
      const msg = "error" in json ? json.error : `Erreur (${res.status})`;
      setErr(msg);
      return;
    }

    if (Array.isArray(json.slots) && json.slots.length > 0) {
      // on remappe pour être sûr qu'on a un slot pour chaque weekday
      const map = new Map<number, Slot>();
      for (const s of json.slots) map.set(s.weekday, s);

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
    } else {
      // aucun planning => on garde default local
      setSlots(defaultSlots());
    }
  };

  useEffect(() => {
    if (!ready || !session || !authHeader) return;
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, parkingId]);

  const setSlot = (weekday: number, patch: Partial<Slot>) => {
    setSlots((prev) =>
      prev.map((s) => (s.weekday === weekday ? { ...s, ...patch, weekday } : s))
    );
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

  const applyPreset = (p: "office" | "evening" | "allday") => {
    setOkMsg(null);
    setErr(null);
    if (p === "office") setSlots(presetOffice());
    if (p === "evening") setSlots(presetEvening());
    if (p === "allday") setSlots(presetAllDay());
  };

  const validate = (): string | null => {
    for (const s of slots) {
      if (!Number.isFinite(s.weekday) || s.weekday < 1 || s.weekday > 7) return "weekday invalide";
      if (!isTimeHHMM(s.start_time) || !isTimeHHMM(s.end_time)) return "Heures invalides";
      if (s.enabled && s.end_time <= s.start_time) return "end_time doit être après start_time";
    }
    return null;
  };

  const save = async () => {
    if (!authHeader) return;
    setErr(null);
    setOkMsg(null);

    const v = validate();
    if (v) {
      setErr(v);
      return;
    }

    setSaving(true);

    const res = await fetch("/api/owner/availability/upsert", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        parkingId,
        slots,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);

    if (!res.ok || !json.ok) {
      setErr(json.error ?? `Erreur (${res.status})`);
      return;
    }

    setOkMsg("✅ Planning enregistré !");
  };

  const enabledCount = useMemo(() => slots.filter((s) => s.enabled).length, [slots]);

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h1}>Planning de disponibilité</h1>
            <p className={UI.p}>
              Définis quand ta place peut être louée. Si tu ne configures rien, la place reste “ouverte” (fallback legacy).
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <span className={UI.chip}>Place : <span className="font-mono">{parkingId}</span></span>
              <span className={UI.chip}>Jours actifs : <b>{enabledCount}/7</b></span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Mes places
            </Link>
            <Link href={`/my-parkings/${parkingId}/edit`} className={`${UI.btnBase} ${UI.btnGhost}`}>
              Modifier la place
            </Link>
          </div>
        </header>

        {!ready ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        ) : !session ? (
          <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
            <p className={UI.p}>Tu dois être connecté.</p>
            <Link href="/login" className={`${UI.btnBase} ${UI.btnPrimary}`}>
              Se connecter
            </Link>
          </div>
        ) : (
          <>
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

            {/* Presets */}
            <section className={`${UI.card} ${UI.cardPad} space-y-3`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className={UI.h2}>Préréglages</h2>
                  <p className={UI.subtle}>Pour configurer en 1 clic.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => applyPreset("office")}>
                    Bureau (Lun–Ven)
                  </button>
                  <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => applyPreset("evening")}>
                    Soir (tous les jours)
                  </button>
                  <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => applyPreset("allday")}>
                    24/7
                  </button>
                </div>
              </div>
            </section>

            {/* WOW Grid */}
            <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className={UI.h2}>Semaine</h2>
                <button
                  type="button"
                  className={`${UI.btnBase} ${UI.btnGhost}`}
                  onClick={() => setSlots(defaultSlots())}
                >
                  Réinitialiser
                </button>
              </div>

              <div className="grid gap-3">
                {DAYS.map((d) => {
                  const s = slots.find((x) => x.weekday === d.weekday) ?? {
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
                      {/* left */}
                      <div className="flex items-center justify-between sm:justify-start gap-3 sm:w-[220px]">
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
                            <div className="text-xs text-slate-500">
                              {s.enabled ? "Disponible" : "Fermé"}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={[
                            UI.btnBase,
                            UI.btnGhost,
                            "px-3 py-2 rounded-full",
                            s.enabled ? "ring-1 ring-violet-200" : "",
                          ].join(" ")}
                          onClick={() => setSlot(d.weekday, { enabled: !s.enabled })}
                          title="Activer / désactiver ce jour"
                        >
                          {s.enabled ? "ON" : "OFF"}
                        </button>
                      </div>

                      {/* middle */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1">
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
                          <button
                            type="button"
                            className={`${UI.btnBase} ${UI.btnGhost}`}
                            onClick={() => copyToAll(d.weekday)}
                            title="Copier ce créneau à tous les jours"
                          >
                            Copier → Tous
                          </button>
                        </div>
                      </div>

                      {/* right: mini bar */}
                      <div className="sm:w-[180px]">
                        <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200/70">
                          <div
                            className={[
                              "h-full",
                              s.enabled ? "bg-violet-600/70" : "bg-slate-300/60",
                            ].join(" ")}
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
            </section>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                className={`${UI.btnBase} ${UI.btnPrimary}`}
                onClick={() => void save()}
                disabled={saving || loading}
              >
                {saving ? "Enregistrement…" : "Enregistrer le planning"}
              </button>

              <button
                type="button"
                className={`${UI.btnBase} ${UI.btnGhost}`}
                onClick={() => void load()}
                disabled={saving || loading}
              >
                {loading ? "…" : "Recharger"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
