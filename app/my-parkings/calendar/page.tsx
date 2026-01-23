// app/my-parkings/calendar/page.tsx
"use client";

import Link from "next/link";
import { UI } from "@/app/components/ui";
import OwnerCalendarClient from "./owner-calendar-client";

export default function OwnerCalendarPage() {
  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h1}>Calendrier des réservations</h1>
            <p className={UI.p}>Toutes tes places, en semaine / mois. Clique un event → drawer.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Mes places
            </Link>
            <Link href="/messages" className={`${UI.btnBase} ${UI.btnGhost}`}>
              Messages
            </Link>
          </div>
        </header>

        <section className={`${UI.card} ${UI.cardPad}`}>
          <OwnerCalendarClient />
        </section>
      </div>
    </main>
  );
}
