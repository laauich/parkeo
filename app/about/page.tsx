// app/about/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { UI } from "@/app/components/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "À propos de Parkeo",
  description:
    "Parkeo est une plateforme de location et réservation de places de parking à Genève. Paiement sécurisé, réservation rapide, anti double-réservation.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "À propos | Parkeo",
    description:
      "Plateforme de location et réservation de places de parking à Genève. Paiement sécurisé, réservation rapide, anti double-réservation.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-8`}>
        <div className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>À propos</h1>
            <p className={UI.p}>
              Parkeo aide à trouver et réserver des places de parking à Genève,
              simplement, avec paiement sécurisé.
            </p>
          </div>

          <Link href="/" className={`${UI.btnBase} ${UI.btnGhost}`}>
            ← Accueil
          </Link>
        </div>

        <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
          <h2 className={UI.h2}>Le concept</h2>
          <p className={UI.p}>
            Parkeo met en relation des conducteurs qui cherchent une place avec
            des propriétaires (particuliers, régies, entreprises) qui souhaitent
            rentabiliser des emplacements inutilisés.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className={`${UI.card} ${UI.cardPad}`}>
              <div className="font-semibold text-slate-900">Rapide</div>
              <p className={`${UI.p} mt-1`}>
                Réservation en quelques clics (date/heure, prix, confirmation).
              </p>
            </div>

            <div className={`${UI.card} ${UI.cardPad}`}>
              <div className="font-semibold text-slate-900">Fiable</div>
              <p className={`${UI.p} mt-1`}>
                Anti double-réservation : un créneau = une réservation.
              </p>
            </div>

            <div className={`${UI.card} ${UI.cardPad}`}>
              <div className="font-semibold text-slate-900">Sécurisé</div>
              <p className={`${UI.p} mt-1`}>
                Paiement via Stripe, confirmation automatique après paiement.
              </p>
            </div>
          </div>

          <div className={UI.divider} />

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/map" className={`${UI.btnBase} ${UI.btnPrimary}`}>
              Voir la carte
            </Link>
            <Link href="/parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              Trouver une place
            </Link>
          </div>

          <p className={UI.subtle}>
            Support : ajoute ici ton email de support quand tu veux.
          </p>
        </section>
      </div>
    </main>
  );
}
