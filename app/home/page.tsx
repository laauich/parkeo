import Link from "next/link";
import { UI } from "@/app/components/ui";

export default function HomeLandingPage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-12">
      <section className="border rounded p-8 text-center space-y-4">
        <h1 className="text-3xl font-semibold">
          Parkeo — Louez et réservez des places de parking à Genève
        </h1>

        <p className="text-gray-600 max-w-2xl mx-auto">
          Réservation à l’heure ou à la journée. Propriétaires, régies et
          entreprises : mettez vos places inutilisées à disposition.
        </p>

        <div className="flex justify-center gap-4 pt-4">
          <Link href="/map" className={UI.btnPrimary}>
            🗺️ Voir la carte
          </Link>

          <Link href="/parkings/new" className={UI.btnGhost}>
            Proposer ma place
          </Link>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          MVP local (Genève). Paiement Stripe et version PRO 🇨🇭 à venir.
        </p>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Simple</h2>
          <p className="mt-2 text-sm text-gray-600">
            Réservez en quelques clics : date/heure, prix, confirmation.
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Fiable</h2>
          <p className="mt-2 text-sm text-gray-600">
            Anti-double réservation : un créneau = une réservation.
          </p>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold">Pour les pros</h2>
          <p className="mt-2 text-sm text-gray-600">
            Régies & entreprises : valorisez vos places non utilisées.
          </p>
        </div>
      </section>

      <section className="text-sm text-gray-500 text-center">
        <Link className="underline" href="/map">
          Aller sur la carte →
        </Link>
      </section>
    </main>
  );
}
