// app/about/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { UI } from "@/app/components/ui";
import ContactFormClient from "./ContactFormClient";

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

          {/* ✅ Support premium + CTA direct */}
          <div className="rounded-2xl border border-slate-200/70 bg-white/60 backdrop-blur p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">Support Parkeo</div>
                <p className="text-sm text-slate-700">
                  Une question, un bug, une demande ? Écris-nous :
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className={UI.chip}>
                    ✉️ <b>support@parkeo.ch</b>
                  </span>
                  <span className={`${UI.chip} bg-emerald-50 border-emerald-200 text-emerald-700`}>
                    Réponse sous 24h ouvrées
                  </span>
                </div>
              </div>

              <a
                href="mailto:support@parkeo.ch"
                className={`${UI.btnBase} ${UI.btnGhost}`}
              >
                Écrire un email
              </a>
            </div>
          </div>
        </section>

        {/* ✅ Formulaire de contact ultra premium */}
        <ContactFormClient />
      </div>
    </main>
  );
}
