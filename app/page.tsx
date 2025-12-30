import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Aperçu: 6 dernières places actives
  const { data: parkings } = await supabase
    .from("parkings")
    .select("id,title,address,price_hour,price_day,created_at,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <main className="space-y-10">
      {/* HERO */}
      <section className="border rounded p-6">
        <h1 className="text-3xl font-semibold">
          Parkeo — Louez et réservez des places de parking à Genève
        </h1>
        <p className="mt-3 text-gray-600">
          Réservation à l’heure ou à la journée. Propriétaires, régies et
          entreprises : mettez vos places inutilisées à disposition.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/parkings"
            className="border rounded px-4 py-2 font-medium"
          >
            Trouver une place
          </Link>
          <Link
            href="/create-parking"
            className="border rounded px-4 py-2"
          >
            Proposer ma place
          </Link>
          <Link href="/my-bookings" className="underline px-2 py-2">
            Mes réservations
          </Link>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          MVP local (Genève). Paiement Stripe et version PRO 🇨🇭 à venir.
        </p>
      </section>

      {/* BENEFICES */}
      <section className="grid md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold">Simple</h2>
          <p className="mt-2 text-sm text-gray-600">
            Réservez en quelques clics : date/heure, prix estimé, confirmation.
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

      {/* APERÇU */}
      <section className="border rounded p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Dernières places</h2>
          <Link href="/parkings" className="underline">
            Voir tout
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {parkings && parkings.length > 0 ? (
            parkings.map((p) => (
              <Link
                key={p.id}
                href={`/parkings/${p.id}`}
                className="block border rounded p-4 hover:bg-gray-50 transition"
              >
                <div className="font-medium">{p.title}</div>
                <div className="text-sm text-gray-600">{p.address}</div>
                <div className="mt-2 text-sm">
                  💰 {p.price_hour} CHF / h
                  {p.price_day ? ` · ${p.price_day} CHF / jour` : ""}
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-gray-500">
              Aucune place disponible pour le moment.{" "}
              <Link className="underline" href="/create-parking">
                Proposer une place
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <section className="text-sm text-gray-500">
        <p>
          Besoin d’une version PRO pour régies/entreprises (contrats, factures,
          multi-utilisateurs) ? On la construit juste après validation MVP.
        </p>
      </section>
    </main>
  );
}
