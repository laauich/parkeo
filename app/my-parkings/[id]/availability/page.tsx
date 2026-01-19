// app/my-parkings/[id]/availability/page.tsx
import Link from "next/link";
import { UI } from "@/app/components/ui";
import ParkingAvailabilityPlanner from "@/app/components/ParkingAvailabilityPlanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ParkingAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h1}>Planning</h1>
            <p className={UI.p}>
              Définis les horaires où ta place est disponible à la location.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/my-parkings/${id}/edit`} className={`${UI.btnBase} ${UI.btnGhost}`}>
              Modifier la place
            </Link>
            <Link href={`/my-parkings/${id}/bookings`} className={`${UI.btnBase} ${UI.btnGhost}`}>
              Réservations
            </Link>
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Mes places
            </Link>
          </div>
        </header>

        <section className={`${UI.card} ${UI.cardPad}`}>
          <ParkingAvailabilityPlanner parkingId={id} />
        </section>
      </div>
    </main>
  );
}
