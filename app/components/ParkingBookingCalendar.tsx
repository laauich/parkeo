"use client";

import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayjs from "dayjs";
import type { EventInput } from "@fullcalendar/core";

import { UI } from "@/app/components/ui";
import { useAuth } from "@/app/providers/AuthProvider";

type ParkingSlot = {
  id: string;
  parking_id: string;
  start_time: string;
  end_time: string;
  booked: boolean;
};

interface ParkingBookingCalendarProps {
  parkingId: string;
}

export default function ParkingBookingCalendar({ parkingId }: ParkingBookingCalendarProps) {
  const { ready, session, supabase } = useAuth();
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;

    const fetchSlots = async () => {
      setLoading(true);
      const { data, error: fetchErr } = await supabase
        .from("parking_slots")
        .select("*")
        .eq("parking_id", parkingId)
        .order("start_time", { ascending: true });

      if (fetchErr) setError(fetchErr.message);
      else setSlots((data as ParkingSlot[]) || []);

      setLoading(false);
    };

    void fetchSlots();
  }, [ready, session, supabase, parkingId]);

  const events: EventInput[] = slots.map((s) => ({
    id: s.id,
    title: s.booked ? "Réservé" : "Libre",
    start: s.start_time,
    end: s.end_time,
    color: s.booked ? "#f87171" : "#34d399",
  }));

  if (!ready) return <p className={UI.p}>Chargement…</p>;
  if (!session) return <p className={UI.p}>Tu dois être connecté.</p>;
  if (loading) return <p className={UI.p}>Chargement des créneaux…</p>;
  if (error) return <p className={`${UI.p} text-red-500`}>{error}</p>;

  return (
    <div className={UI.card}>
      {slots.length === 0 ? (
        <p className={UI.p}>Aucun créneau défini.</p>
      ) : (
        <FullCalendar
          plugins={[timeGridPlugin]}
          initialView="timeGridWeek"
          allDaySlot={false}
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          events={events}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek",
          }}
          eventClick={(info) => {
            alert(
              `Créneau : ${dayjs(info.event.start).format("DD/MM HH:mm")} → ${dayjs(
                info.event.end
              ).format("HH:mm")}\nStatus: ${info.event.title}`
            );
          }}
        />
      )}
    </div>
  );
}
