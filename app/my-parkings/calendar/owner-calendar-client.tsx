// app/my-parkings/calendar/owner-calendar-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";

type ApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps: {
    bookingId: string;
    parkingId: string | null;
    parkingTitle: string;
    status: string;
    paymentStatus: string;
    totalPrice: number | null;
    currency: string;
  };
};

type CancelOk = { ok: true; refunded?: boolean; already?: boolean };
type CancelErr = { ok: false; error: string; detail?: string };
type CancelApiResponse = CancelOk | CancelErr;

type Filter = "all" | "confirmed" | "pending" | "cancelled";

function money(v: number | null, currency?: string | null) {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v} ${(currency ?? "CHF").toUpperCase()}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusKeyFromEvent(e: ApiEvent) {
  const s = (e.extendedProps.status ?? "").toLowerCase();
  const pay = (e.extendedProps.paymentStatus ?? "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s.includes("pending") || pay === "unpaid") return "pending";
  if (s === "confirmed") return "confirmed";
  return "other";
}

function matchesFilterEvent(e: ApiEvent, f: Filter) {
  if (f === "all") return true;
  return statusKeyFromEvent(e) === f;
}

// ✅ couleur stable par parkingId
function colorFromString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360; // 0..359
  // palette “clean”
  return {
    bg: `hsla(${hue}, 85%, 55%, 0.16)`,
    border: `hsla(${hue}, 85%, 45%, 0.40)`,
    text: `hsl(${hue}, 55%, 25%)`,
  };
}

function WowDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-white shadow-2xl border-l border-slate-200/70">
        <div className="p-5 border-b border-slate-200/70 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">Réservation</div>
            <div className="text-lg font-semibold text-slate-900 truncate">{title}</div>
          </div>
          <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function OwnerCalendarClient() {
  const { ready, session } = useAuth();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [parkingId, setParkingId] = useState<string>("all");

  // events fetched
  const [events, setEvents] = useState<ApiEvent[]>([]);

  // responsive view
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ApiEvent | null>(null);

  // confirm cancel
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLines, setConfirmLines] = useState<string[]>([]);
  const [confirmTone, setConfirmTone] = useState<"success" | "warning" | "danger" | "info">("warning");
  const [confirmSummaryState, setConfirmSummaryState] = useState<
    { badge?: string; title?: string; text?: string } | undefined
  >(undefined);

  const authHeader = useMemo(() => {
    const t = session?.access_token;
    return t ? { Authorization: `Bearer ${t}` } : null;
  }, [session?.access_token]);

  const fetchEvents = async (rangeStart: string, rangeEnd: string) => {
    if (!authHeader) return;
    setLoading(true);
    setErr(null);

    try {
      const url = new URL("/api/owner/calendar", window.location.origin);
      url.searchParams.set("start", rangeStart);
      url.searchParams.set("end", rangeEnd);
      url.searchParams.set("parkingId", parkingId);
      url.searchParams.set("status", filter === "all" ? "all" : "all"); // on filtre côté client pour UX instant
      const res = await fetch(url.toString(), { headers: authHeader });

      const json = (await res.json().catch(() => ({}))) as
        | { ok: true; events: ApiEvent[] }
        | { ok: false; error: string };

      if (!res.ok || !("ok" in json) || json.ok === false) {
        setErr("error" in json ? json.error : `Erreur (${res.status})`);
        setEvents([]);
        setLoading(false);
        return;
      }

      setEvents(Array.isArray(json.events) ? json.events : []);
      setLoading(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
      setEvents([]);
      setLoading(false);
    }
  };

  const filteredEvents = useMemo(() => events.filter((e) => matchesFilterEvent(e, filter)), [events, filter]);

  const uniqueParkings = useMemo(() => {
    const map = new Map<string, string>(); // id -> title
    for (const e of events) {
      const pid = e.extendedProps.parkingId ?? "";
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, e.extendedProps.parkingTitle || "Place");
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [events]);

  const counts = useMemo(() => {
    const all = events.length;
    const confirmed = events.filter((e) => statusKeyFromEvent(e) === "confirmed").length;
    const pending = events.filter((e) => statusKeyFromEvent(e) === "pending").length;
    const cancelled = events.filter((e) => statusKeyFromEvent(e) === "cancelled").length;
    return { all, confirmed, pending, cancelled };
  }, [events]);

  const onEventClick = (arg: EventClickArg) => {
    const props = arg.event.extendedProps as ApiEvent["extendedProps"] | undefined;
    if (!props) return;

    const found = filteredEvents.find((x) => x.id === arg.event.id) ?? events.find((x) => x.id === arg.event.id) ?? null;
    if (!found) return;

    setSelected(found);
    setDrawerOpen(true);
  };

  const openCancelConfirm = (ev: ApiEvent) => {
    const pay = (ev.extendedProps.paymentStatus ?? "").toLowerCase();
    if (pay === "paid") {
      setConfirmTone("warning");
      setConfirmSummaryState({
        badge: "Remboursement ✅",
        title: "Le client sera remboursé",
        text: `Annulation propriétaire : remboursement automatique de ${money(ev.extendedProps.totalPrice, ev.extendedProps.currency)}.`,
      });
    } else {
      setConfirmTone("info");
      setConfirmSummaryState({
        badge: "Non payé",
        title: "Réservation non payée",
        text: "Annulation simple (pas de remboursement).",
      });
    }

    setConfirmLines([
      `Place : ${ev.extendedProps.parkingTitle}`,
      `Début : ${formatDateTime(ev.start)}`,
      `Fin : ${formatDateTime(ev.end)}`,
      `Montant : ${money(ev.extendedProps.totalPrice, ev.extendedProps.currency)}`,
      `Paiement : ${ev.extendedProps.paymentStatus}`,
      "",
      "Confirmer l’annulation ?",
    ]);

    setConfirmOpen(true);
  };

  const doCancelOwner = async () => {
    if (!session || !selected) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/owner/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId: selected.extendedProps.bookingId }),
      });

      const json = (await res.json().catch(() => ({}))) as CancelApiResponse;

      if (!res.ok || !json.ok) {
        const msg =
          "error" in json
            ? `${json.error}${json.detail ? ` — ${json.detail}` : ""}`
            : `Erreur annulation (${res.status})`;
        setErr(msg);
        setLoading(false);
        setConfirmOpen(false);
        return;
      }

      // refresh simple : on ferme et on laisse FullCalendar refetch (dates via datesSet)
      setConfirmOpen(false);
      setDrawerOpen(false);
      setSelected(null);
      setLoading(false);

      // mini hard refresh events: on ne connait pas la range ici -> le datesSet va refetch au prochain render,
      // donc on force un "events cleared" + l'utilisateur clique nav -> refetch.
      // (on garde simple pour ne pas casser ton UX)
      setEvents((prev) => prev.filter((e) => e.id !== selected.id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
    danger: `${UI.btnBase} ${UI.btnDanger}`,
  };

  // ✅ Styles FullCalendar “wow” + status overlays
  const calendarGlobalCss = useMemo(
    () => `
      .fc { font-family: inherit; }
      .fc .fc-toolbar-title { font-size: 1rem; font-weight: 800; color: #0f172a; }
      .fc .fc-button {
        border-radius: 9999px !important;
        border: 1px solid rgba(226, 232, 240, 1) !important;
        background: rgba(255, 255, 255, 0.88) !important;
        color: #0f172a !important;
        padding: 0.5rem 0.85rem !important;
        box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
      }
      .fc .fc-button:hover { filter: brightness(0.985); }
      .fc .fc-button-primary:not(:disabled).fc-button-active {
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15) !important;
        border-color: rgba(139, 92, 246, 0.35) !important;
      }
      .fc .fc-timegrid-slot-label,
      .fc .fc-col-header-cell-cushion,
      .fc .fc-daygrid-day-number { color: #475569; }

      /* “glass” */
      .fc .fc-scrollgrid, .fc .fc-scrollgrid-section > td {
        background: rgba(255,255,255,0.65);
        backdrop-filter: blur(8px);
      }
      .fc .fc-scrollgrid {
        border: 1px solid rgba(226,232,240,0.7);
        border-radius: 16px;
        overflow: hidden;
      }

      /* status hint */
      .evt-cancelled { opacity: 0.85; }
      .evt-cancelled .fc-event-title { text-decoration: line-through; }

      /* event padding */
      .fc .fc-event { border-radius: 12px; }
      .fc .fc-event .fc-event-main { padding: 6px 8px; }
    `,
    []
  );

  if (!ready) return <p className={UI.p}>Chargement…</p>;
  if (!session) return <p className={UI.p}>Tu dois être connecté.</p>;

  return (
    <div className="space-y-4">
      <style jsx global>{calendarGlobalCss}</style>

      <ConfirmModal
        open={confirmOpen}
        title="Annuler (propriétaire)"
        lines={confirmLines}
        summary={confirmSummaryState}
        summaryTone={confirmTone}
        confirmLabel="Confirmer l’annulation"
        cancelLabel="Retour"
        danger
        loading={loading}
        onClose={() => {
          if (loading) return;
          setConfirmOpen(false);
        }}
        onConfirm={doCancelOwner}
      />

      <WowDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelected(null);
        }}
        title={selected ? `${selected.extendedProps.parkingTitle} — ${selected.extendedProps.status}` : "Détails"}
      >
        {!selected ? (
          <p className={UI.p}>Aucune réservation sélectionnée.</p>
        ) : (
          <div className="space-y-4">
            <div className={`${UI.card} ${UI.cardPad} space-y-2`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900 truncate">{selected.extendedProps.parkingTitle}</div>
                <span className={UI.chip}>
                  {statusKeyFromEvent(selected) === "confirmed"
                    ? "Confirmée"
                    : statusKeyFromEvent(selected) === "pending"
                    ? "En attente"
                    : statusKeyFromEvent(selected) === "cancelled"
                    ? "Annulée"
                    : "—"}
                </span>
              </div>

              <div className="text-sm text-slate-700">
                <div>
                  <span className="text-slate-500">Début :</span>{" "}
                  <b className="text-slate-900">{formatDateTime(selected.start)}</b>
                </div>
                <div>
                  <span className="text-slate-500">Fin :</span>{" "}
                  <b className="text-slate-900">{formatDateTime(selected.end)}</b>
                </div>
                <div className="pt-1">
                  <span className="text-slate-500">Total :</span>{" "}
                  <b className="text-slate-900">
                    {money(selected.extendedProps.totalPrice, selected.extendedProps.currency)}
                  </b>
                </div>
                <div className="text-xs text-slate-500 pt-1">
                  Paiement :{" "}
                  <span className="font-medium text-slate-900">{selected.extendedProps.paymentStatus}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                className={`${Btn.danger} w-full sm:flex-1`}
                disabled={loading || (selected.extendedProps.status ?? "").toLowerCase() === "cancelled"}
                onClick={() => openCancelConfirm(selected)}
                title={(selected.extendedProps.status ?? "").toLowerCase() === "cancelled" ? "Déjà annulée" : ""}
              >
                Annuler
              </button>
            </div>

            <div className="pt-2 text-xs text-slate-500 border-t border-slate-200/70">
              Remarque : l’annulation propriétaire déclenche un remboursement automatique uniquement si la réservation est payée.
            </div>
          </div>
        )}
      </WowDrawer>

      {err ? (
        <div className={`${UI.card} ${UI.cardPad} border border-rose-200 bg-rose-50/60`}>
          <p className="text-sm text-rose-700">
            <b>Erreur :</b> {err}
          </p>
        </div>
      ) : null}

      {/* Barre filtres */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            className={`${UI.btnBase} ${filter === "all" ? UI.btnPrimary : UI.btnGhost}`}
            onClick={() => setFilter("all")}
          >
            Toutes ({counts.all})
          </button>
          <button
            type="button"
            className={`${UI.btnBase} ${filter === "confirmed" ? UI.btnPrimary : UI.btnGhost}`}
            onClick={() => setFilter("confirmed")}
          >
            Confirmées ({counts.confirmed})
          </button>
          <button
            type="button"
            className={`${UI.btnBase} ${filter === "pending" ? UI.btnPrimary : UI.btnGhost}`}
            onClick={() => setFilter("pending")}
          >
            En attente ({counts.pending})
          </button>
          <button
            type="button"
            className={`${UI.btnBase} ${filter === "cancelled" ? UI.btnPrimary : UI.btnGhost}`}
            onClick={() => setFilter("cancelled")}
          >
            Annulées ({counts.cancelled})
          </button>
        </div>

        {/* select parking */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Place</span>
          <select
            className={UI.select}
            value={parkingId}
            onChange={(e) => setParkingId(e.target.value)}
            title="Filtrer par place"
          >
            <option value="all">Toutes</option>
            {uniqueParkings.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`${UI.btnBase} ${UI.btnGhost}`}
            onClick={() => {
              // force refresh by triggering a refetch on next datesSet
              setEvents([]);
              setErr(null);
            }}
            disabled={loading}
          >
            {loading ? "…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-2">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={isMobile ? "dayGridMonth" : "timeGridWeek"}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: isMobile ? "dayGridMonth,timeGridWeek" : "timeGridWeek,dayGridMonth",
          }}
          height="auto"
          nowIndicator
          selectable={false}
          eventClick={onEventClick}
          events={filteredEvents.map((e) => {
            const pid = e.extendedProps.parkingId ?? e.extendedProps.parkingTitle ?? "place";
            const c = colorFromString(pid);
            const k = statusKeyFromEvent(e);

            return {
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              classNames: [k === "cancelled" ? "evt-cancelled" : ""].filter(Boolean),
              backgroundColor: c.bg,
              borderColor: c.border,
              textColor: c.text,
              extendedProps: e.extendedProps,
            };
          })}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          allDaySlot={false}
          datesSet={(arg) => {
            // fetch range visible
            if (!authHeader) return;
            void fetchEvents(arg.startStr, arg.endStr);
          }}
        />
      </div>
    </div>
  );
}
