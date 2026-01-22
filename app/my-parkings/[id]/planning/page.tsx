"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayjs from "dayjs";
import type { EventInput } from "@fullcalendar/core";

import { UI } from "@/app/components/ui";
import { useAuth } from "@/app/providers/AuthProvider";

type Parking = {
  id: string;
  title: string;
};

type ParkingSlot = {
  id: string;
  parking_id: string;
  start_time: string;
  end_time: string;
  booked: boolean;
};

export default function ParkingPlanningPage() {
  const router = useRouter();
  const params = useParams();
  const parkingId = params.id as string;

  const { ready, session, supabase } = useAuth();

  const [parking, setParking] = useState<Parking | null>(null);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  // Charger la place
  useEffect(() => {
    if (!ready || !session) return;

    const fetchParking = async () => {
      const { data, error: fetchErr } = await supabase
        .from("parkings")
        .select("id, title")
        .eq("id", parkingId)
        .single();

      if (fetchErr) setError(fetchErr.message);
      else setParking(data);

      setLoading(false);
    };

    void fetchParking();
  }, [ready, session, supabase, parkingId]);

  // Charger les créneaux
  useEffect(() => {
    if (!ready || !session) return;

    const fetchSlots = async () => {
      const { data, error: fetchErr } = await supabase
        .from("parking_slots")
        .select("*")
        .eq("parking_id", parkingId)
        .order("start_time", { ascending: true });

      if (fetchErr) setError(fetchErr.message);
      else setSlots((data as ParkingSlot[]) || []);
    };

    void fetchSlots();
  }, [ready, session, supabase, parkingId]);

  // Ajouter un créneau
  const addSlot = async () => {
    if (!newStart || !newEnd) return alert("Sélectionne début et fin");
    if (newEnd < newStart) return alert("Fin doit être après début");

    const { data, error: insertErr } = await supabase
      .from("parking_slots")
      .insert([{ parking_id: parkingId, start_time: newStart, end_time: newEnd, booked: false }])
      .select()
      .single();

    if (insertErr) return alert(insertErr.message);

    setSlots((prev) => [...prev, data as ParkingSlot]);
    setNewStart("");
    setNewEnd("");
  };

  // Supprimer un créneau
  const deleteSlot = async (id: string) => {
    if (!confirm("Supprimer ce créneau ?")) return;
    const { error: delErr } = await supabase.from("parking_slots").delete().eq("id", id);
    if (delErr) return alert(delErr.message);
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const events: EventInput[] = slots.map((s) => ({
    id: s.id,
    title: s.booked ? "Réservé" : "Libre",
    start: s.start_time,
    end: s.end_time,
    color: s.booked ? "#f87171" : "#34d399", // rouge si réservé, vert sinon
  }));

  if (!ready) return <p className={UI.p}>Chargement…</p>;
  if (!session) return <p className={UI.p}>Tu dois être connecté.</p>;
  if (loading) return <p className={UI.p}>Chargement de la place…</p>;
  if (!parking) return <p className={UI.p}>Parking introuvable.</p>;
  if (error) return <p className={`${UI.p} text-red-500`}>{error}</p>;

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>Planning : {parking.title}</h1>
            <p className={UI.p}>Gère les créneaux de disponibilité de cette place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => router.back()}>
              ← Retour
            </button>
          </div>
        </header>

        {/* Ajouter un créneau */}
        <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-900">Début</label>
              <input
                type="datetime-local"
                className={UI.input}
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-900">Fin</label>
              <input
                type="datetime-local"
                className={UI.input}
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
              />
            </div>
          </div>
          <button className={`${UI.btnBase} ${UI.btnPrimary}`} onClick={addSlot}>
            Ajouter le créneau
          </button>
        </div>

        {/* FullCalendar */}
        <div className={`${UI.card} ${UI.cardPad}`}>
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

        {/* Liste des slots */}
        <div className={`${UI.card} ${UI.cardPad} space-y-2`}>
          <h2 className={UI.h2}>Liste des créneaux</h2>
          {slots.map((s) => (
            <div
              key={s.id}
              className="flex justify-between items-center border rounded p-2 bg-slate-50"
            >
              <span>
                {dayjs(s.start_time).format("DD/MM HH:mm")} → {dayjs(s.end_time).format("HH:mm")}{" "}
                {s.booked ? "(Réservé)" : "(Libre)"}
              </span>
              {!s.booked && (
                <button
                  className={`${UI.btnBase} ${UI.btnGhost} text-red-500`}
                  onClick={() => deleteSlot(s.id)}
                >
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
