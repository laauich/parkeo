// app/my-parkings/[id]/availability/page.tsx
import Link from "next/link";
import { UI } from "@/app/components/ui";
import ParkingAvailabilityPlanner from "@/app/components/ParkingAvailabilityPlanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parkingId = (id ?? "").trim();

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h1}>Planning de disponibilité</h1>
            <p className={UI.p}>
              Définis quand ta place peut être louée. Si tu ne configures rien,
              la place reste “ouverte” (fallback legacy).
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <span className={UI.chip}>
                Place : <span className="font-mono">{parkingId}</span>
              </span>
              <span className={UI.chip}>Optionnel (fallback si vide)</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Mes places
            </Link>

            <Link
              href={`/my-parkings/${parkingId}/edit`}
              className={`${UI.btnBase} ${UI.btnGhost}`}
            >
              Modifier la place
            </Link>
          </div>
        </header>

        {!parkingId ? (
          <div
            className={`${UI.card} ${UI.cardPad} border border-rose-200 bg-rose-50/60`}
          >
            <p className="text-sm text-rose-700">
              <b>Erreur :</b> parkingId manquant (URL invalide).
            </p>
          </div>
        ) : (
          <section className={`${UI.card} ${UI.cardPad}`}>
            {/* ✅ le planner est client-side et gère load/save */}
            <ParkingAvailabilityPlanner parkingId={parkingId} />
          </section>
        )}
      </div>
    </main>
  );
}
