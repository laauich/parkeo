// app/my-parkings/[id]/bookings/page.tsx
import Link from "next/link";
import BookingsClient from "./bookings-client";
import { UI } from "@/app/components/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MyParkingBookingsPage({
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
            <h1 className={UI.h1}>Réservations</h1>
            <p className={UI.p}>
              Gère les réservations reçues sur ta place (annulation propriétaire,
              statut, remboursement selon règles).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/parkings/${id}`}
              className={`${UI.btnBase} ${UI.btnGhost}`}
            >
              Ouvrir la place
            </Link>
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Mes places
            </Link>
          </div>
        </header>

        <section className={`${UI.card} ${UI.cardPad}`}>
          <BookingsClient parkingId={id} />
        </section>
      </div>
    </main>
  );
}
