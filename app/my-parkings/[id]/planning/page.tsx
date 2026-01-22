"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { UI } from "@/app/components/ui";
import { useAuth } from "@/app/providers/AuthProvider";

// Types TS
type Parking = {
  id: string;
  title: string;
};

type Slot = {
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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        .single<Parking>();

      if (fetchErr) setError(fetchErr.message);
      else setParking(data);
    };

    void fetchParking();
  }, [ready, session, supabase, parkingId]);

  // Charger les slots
  useEffect(() => {
    if (!ready || !session) return;

    const fetchSlots = async () => {
      const { data, error: fetchErr } = await supabase
        .from("parking_slots")
        .select("*")
        .eq("parking_id", parkingId)
        .order("start_time", { ascending: true });

      if (fetchErr) setError(fetchErr.message);
      else setSlots((data as Slot[]) || []);
    };

    void fetchSlots();
  }, [ready, session, supabase, parkingId]);

  // Ajouter un slot
  const addSlot = async () => {
    if (!newStart || !newEnd) return alert("Sélectionne début et fin");
    if (newEnd < newStart) return alert("Fin doit être après début");

    const { data, error: insertErr } = await supabase
      .from("parking_slots")
      .insert([
        {
          parking_id: parkingId,
          start_time: newStart,
          end_time: newEnd,
          booked: false,
        },
      ])
      .select()
      .single<Slot>();

    if (insertErr) return alert(insertErr.message);

    setSlots((prev) => [...prev, data]);
    setNewStart("");
    setNewEnd("");
  };

  // Supprimer un slot
  const deleteSlot = async (id: string) => {
    if (!confirm("Supprimer ce créneau ?")) return;

    const { error: delErr } = await supabase
      .from("parking_slots")
      .delete()
      .eq("id", id);

    if (delErr) return alert(delErr.message);

    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  // ✅ UI Loading / Auth
  if (!ready) return <p className={UI.p}>Chargement…</p>;
  if (!session) return <p className={UI.p}>Tu dois être connecté.</p>;
  if (!parking) return <p className={UI.p}>Parking introuvable.</p>;

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        {/* Header */}
        <header className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>Planning : {parking.title}</h1>
            <p className={UI.p}>
              Gère les créneaux de disponibilité de cette place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`${UI.btnBase} ${UI.btnGhost}`}
              onClick={() => router.back()}
            >
              ← Retour
            </button>
          </div>
        </header>

        {/* Erreur */}
        {error && (
          <div
            className={`${UI.card} ${UI.cardPad} border border-rose-200 bg-rose-50/60`}
          >
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        {/* Ajouter un créneau */}
        <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
          <h2 className={UI.h2}>Ajouter un créneau</h2>
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

        {/* Liste des slots */}
        <div className={`${UI.card} ${UI.cardPad} space-y-2`}>
          <h2 className={UI.h2}>Créneaux disponibles</h2>
          {slots.length === 0 ? (
            <p className={UI.p}>Aucun créneau défini.</p>
          ) : (
            slots.map((s) => (
              <div
                key={s.id}
                className="flex justify-between items-center border rounded p-2 bg-slate-50"
              >
                <span>
                  {s.start_time} → {s.end_time} {s.booked ? "(Réservé)" : "(Libre)"}
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
            ))
          )}
        </div>
      </div>
    </main>
  );
}
