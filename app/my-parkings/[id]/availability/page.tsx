// app/my-parkings/[id]/availability/page.tsx
import Link from "next/link";
import { UI } from "@/app/components/ui";
import AvailabilityClient from "./availability-client";

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
              Définis quand ta place est réservable (horaires hebdo). Si tu ne mets rien, on garde le comportement actuel (fallback).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/my-parkings/${id}/edit`} className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Modifier la place
            </Link>
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              Mes places
            </Link>
          </div>
        </header>

        <section className={`${UI.card} ${UI.cardPad}`}>
          <AvailabilityClient parkingId={id} />
        </section>
      </div>
    </main>
  );
}
