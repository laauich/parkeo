"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

type ParkingRow = { id: string; title: string };

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps?: {
    bookingId?: string;
    parkingId?: string | null;
    parkingTitle?: string;
    status?: string;
    paymentStatus?: string;
    totalPrice?: number | null;
    currency?: string;
  };
};

export default function OwnerCalendarPage() {
  const { ready, session, supabase } = useAuth();

  const [parkings, setParkings] = useState<ParkingRow[]>([]);
  const [parkingId, setParkingId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const authHeader = useMemo(() => {
    const t = session?.access_token;
    return t ? { Authorization: `Bearer ${t}` } : null;
  }, [session?.access_token]);

  // Load owner parkings for dropdown
  useEffect(() => {
    if (!ready || !session) return;

    (async () => {
      const { data, error } = await supabase
        .from("parkings")
        .select("id,title")
        .eq("owner_id", session.user.id)
        .order("created_at", { ascending: false });

      if (!error) setParkings((data ?? []) as ParkingRow[]);
    })();
  }, [ready, session, supabase]);

  // Fetch events for the calendar view range
  const fetchEvents = async (range: { startStr: string; endStr: string }) => {
    if (!authHeader) return;

    setLoading(true);
    setErr(null);

    const qs = new URLSearchParams({
      start: range.startStr,
      end: range.endStr,
      parkingId,
      status: statusFilter,
    });

    const res = await fetch(`/api/owner/calendar?${qs.toString()}`, { headers: authHeader });
    const json = (await res.json().catch(() => ({}))) as
      | { ok: true; events: CalEvent[] }
      | { ok: false; error: string };

    setLoading(false);

    if (!res.ok || !("ok" in json) || json.ok === false) {
      setErr("error" in json ? json.error : `Erreur (${res.status})`);
      setEvents([]);
      return;
    }

    setEvents(json.events ?? []);
  };

  if (!ready) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section}`}>
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section} space-y-4`}>
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Tu dois être connecté.</p>
            <Link href="/login" className={`${UI.btnBase} ${UI.btnPrimary}`}>
              Se connecter
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h1}>Calendrier des réservations</h1>
            <p className={UI.p}>
              Vue semaine / mois, filtre par place. (✅ confirmées / 🕒 en attente de paiement)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Mes places
            </Link>
          </div>
        </header>

        {err ? (
          <div className={`${UI.card} ${UI.cardPad} border border-rose-200 bg-rose-50/60`}>
            <p className="text-sm text-rose-700">
              <b>Erreur :</b> {err}
            </p>
          </div>
        ) : null}

        <div className={`${UI.card} ${UI.cardPad} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={UI.chip}>Place</span>
            <select className={UI.select} value={parkingId} onChange={(e) => setParkingId(e.target.value)}>
              <option value="all">Toutes les places</option>
              {parkings.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>

            <span className={UI.chip}>Statut</span>
            <select
              className={UI.select}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}
            >
              <option value="active">Actives (bloquantes)</option>
              <option value="all">Toutes</option>
            </select>

            {loading ? <span className={UI.chip}>Chargement…</span> : null}
          </div>

          <div className="text-xs text-slate-600">
            Clique sur un event pour voir les détails.
          </div>
        </div>

        <div className={`${UI.card} ${UI.cardPad}`}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "timeGridWeek,dayGridMonth",
            }}
            height="auto"
            events={events}
            datesSet={(info) => void fetchEvents({ startStr: info.startStr, endStr: info.endStr })}
            eventClick={(arg) => {
              const pTitle = arg.event.extendedProps?.parkingTitle ?? "Place";
              const status = arg.event.extendedProps?.status ?? "?";
              const pay = arg.event.extendedProps?.paymentStatus ?? "?";
              const price = arg.event.extendedProps?.totalPrice;
              const cur = arg.event.extendedProps?.currency ?? "CHF";

              alert(
                `${pTitle}\nStatut: ${status}\nPaiement: ${pay}\nPrix: ${
                  price !== null && price !== undefined ? `${price} ${cur}` : "—"
                }\nDébut: ${arg.event.start?.toISOString()}\nFin: ${arg.event.end?.toISOString()}`
              );
            }}
          />
        </div>
      </div>
    </main>
  );
}
