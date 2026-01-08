import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { UI } from "@/app/components/ui";

type ParkingCardRow = {
  id: string;
  title: string;
  address: string | null;
  price_hour: number | null;
  price_day: number | null;
  created_at: string;
  is_active: boolean | null;
};

function IconMap(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 6l-6 2v12l6-2 4 2 6-2V6l-6 2-4-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 6v12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 8v12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBolt(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13 2L4 14h7l-1 8 10-14h-7l0-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 12l1.8 1.8 3.8-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClock(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBuilding(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 21V7l8-4 8 4v14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 21v-6h6v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 11h.01M12 11h.01M16 11h.01M8 14h.01M12 14h.01M16 14h.01"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CardFeature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className={[UI.card, UI.cardPad].join(" ")}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/10 text-violet-700 flex items-center justify-center shrink-0">
          <div className="h-5 w-5">{icon}</div>
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{title}</div>
          <p className={[UI.p, "mt-1"].join(" ")}>{text}</p>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <div className={[UI.card, UI.cardPad].join(" ")}>
      <div className="font-semibold text-slate-900">{q}</div>
      <p className={[UI.p, "mt-2"].join(" ")}>{a}</p>
    </div>
  );
}

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: parkings } = await supabase
    .from("parkings")
    .select("id,title,address,price_hour,price_day,created_at,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  const rows = (parkings ?? []) as ParkingCardRow[];

  return (
    <main className={UI.page}>
      <div className={[UI.container, UI.section].join(" ")}>
        {/* HERO (image + CTA) */}
        <section
          className={[
            UI.card,
            UI.cardPad,
            "relative overflow-hidden",
            "min-h-[320px] sm:min-h-[360px]",
          ].join(" ")}
        >
          {/* Background image */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 bg-center bg-cover opacity-75"
              style={{ backgroundImage: "url(/home-bg.jpg)" }}
            />
            {/* Overlay léger pour garder un rendu premium, sans cacher l'image */}
            <div className="absolute inset-0 bg-white/30" />

            {/* Accents premium */}
            <div className="absolute -top-28 -right-28 h-96 w-96 rounded-full bg-violet-500/14 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-fuchsia-400/12 blur-3xl" />
          </div>

          {/* Content */}
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className={UI.chip}>📍 Genève</span>
              <span className={UI.chip}>Carte interactive</span>
              <span className={UI.chip}>Paiement sécurisé</span>
            </div>

            {/* H1 court (lisible), pas un pavé sur l'image */}
            <h1 className={[UI.h1, "mt-4 max-w-3xl"].join(" ")}>
              Réservez une place de parking à Genève, simplement.
            </h1>

            {/* Ligne courte, pas un paragraphe lourd */}
            <p className={[UI.p, "mt-3 max-w-2xl"].join(" ")}>
              À l’heure ou à la journée. Trouvez une place disponible près de
              vous, et réservez en quelques clics.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link
                href="/map"
                className={[UI.btnBase, UI.btnPrimary].join(" ")}
              >
                Voir la carte
              </Link>

              <Link
                href="/parkings/new"
                className={[UI.btnBase, UI.btnGhost].join(" ")}
              >
                Proposer ma place
              </Link>
            </div>

            <p className={[UI.subtle, "mt-4"].join(" ")}>
              MVP local (Genève). Version PRO 🇨🇭 ensuite.
            </p>
          </div>
        </section>

        {/* MODULES (texte SEO hors image + icônes) */}
        <section className="mt-8">
          <div className={UI.sectionTitleRow}>
            <h2 className={UI.h2}>Pourquoi Parkeo</h2>
            <Link href="/map" className={UI.link}>
              Explorer sur la carte →
            </Link>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <CardFeature
              icon={<IconMap className="h-5 w-5" />}
              title="Recherche rapide"
              text="Trouvez des places proches de votre destination, visualisez-les sur la carte, comparez les prix."
            />
            <CardFeature
              icon={<IconClock className="h-5 w-5" />}
              title="À l’heure ou à la journée"
              text="Sélectionnez vos dates, vérifiez la disponibilité, puis réservez immédiatement."
            />
            <CardFeature
              icon={<IconShield className="h-5 w-5" />}
              title="Réservation fiable"
              text="Anti double-réservation : un créneau correspond à une réservation (paiement sécurisé via Stripe)."
            />
          </div>
        </section>

        {/* PREVIEW (tes dernières places, conservé) */}
        <section className="mt-10">
          <div className={UI.sectionTitleRow}>
            <h2 className={UI.h2}>Dernières places disponibles à Genève</h2>
            <Link href="/parkings" className={UI.link}>
              Voir tout
            </Link>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.length > 0 ? (
              rows.map((p) => (
                <Link
                  key={p.id}
                  href={`/parkings/${p.id}`}
                  className={[UI.card, UI.cardHover, "block"].join(" ")}
                >
                  <div className={UI.cardPad}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {p.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {p.address || "Adresse non renseignée"}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {p.price_hour !== null ? (
                          <div className="text-sm font-semibold text-slate-900">
                            {p.price_hour} CHF/h
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400">—</div>
                        )}
                        {p.price_day !== null ? (
                          <div className="text-xs text-slate-500">
                            {p.price_day} CHF/j
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        Voir détails →
                      </span>
                      <span className={UI.chip}>Disponible</span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className={[UI.card, UI.cardPad].join(" ")}>
                <p className={UI.p}>
                  Aucune place de parking disponible à Genève pour le moment.
                </p>
                <div className="mt-4">
                  <Link
                    href="/parkings/new"
                    className={[UI.btnBase, UI.btnPrimary].join(" ")}
                  >
                    Proposer une place
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SEO LOCAL (texte plus riche, hors image) */}
        <section className="mt-12">
          <div className={UI.sectionTitleRow}>
            <h2 className={UI.h2}>Parking à Genève : réservez en ligne</h2>
            <Link href="/parkings" className={UI.link}>
              Trouver une place →
            </Link>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className={[UI.card, UI.cardPad, "lg:col-span-2"].join(" ")}>
              <p className={UI.p}>
                Parkeo est une plateforme dédiée à la{" "}
                <b>location de places de parking à Genève</b>. Que vous cherchiez
                un parking pour quelques heures, une journée ou davantage, vous
                pouvez <b>réserver une place disponible</b> en quelques clics,
                sans abonnement.
              </p>

              <p className={[UI.p, "mt-3"].join(" ")}>
                Les zones les plus recherchées :{" "}
                <b>Genève centre</b>, <b>Plainpalais</b>, <b>Eaux-Vives</b>,{" "}
                <b>Carouge</b> et alentours. Passez par la carte pour repérer
                l’emplacement exact, puis choisissez vos dates.
              </p>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/map"
                  className={[UI.btnBase, UI.btnPrimary].join(" ")}
                >
                  <IconMap className="h-4 w-4" />
                  Voir les parkings sur la carte
                </Link>
                <Link
                  href="/parkings/new"
                  className={[UI.btnBase, UI.btnGhost].join(" ")}
                >
                  <IconBuilding className="h-4 w-4" />
                  Mettre une place en location
                </Link>
              </div>
            </div>

            <div className={[UI.card, UI.cardPad].join(" ")}>
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <span className="h-9 w-9 rounded-xl bg-violet-600/10 text-violet-700 flex items-center justify-center">
                  <IconBolt className="h-5 w-5" />
                </span>
                <span>Conseils rapides</span>
              </div>

              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>
                  • Comparez <b>prix/h</b> et <b>prix/j</b> selon la durée.
                </li>
                <li>
                  • Réservez tôt pour <b>centre-ville</b> et quartiers très
                  demandés.
                </li>
                <li>
                  • Vérifiez les{" "}
                  <b>instructions d’accès</b> (badge, portail, étage, etc.).
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ (SEO easy win) */}
        <section className="mt-12">
          <h2 className={UI.h2}>Questions fréquentes</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FAQItem
              q="Puis-je réserver un parking à l’heure ?"
              a="Oui. Choisissez votre début et votre fin, Parkeo vérifie la disponibilité et vous pouvez réserver immédiatement."
            />
            <FAQItem
              q="Est-ce possible de réserver à la journée ?"
              a="Oui. Certaines places proposent un tarif journalier (affiché sur la fiche)."
            />
            <FAQItem
              q="Je suis propriétaire : comment proposer ma place ?"
              a="Cliquez sur “Proposer ma place”, ajoutez l’adresse, la localisation sur la carte et des photos. Votre annonce apparaît ensuite sur Parkeo."
            />
            <FAQItem
              q="Où se situe Parkeo ?"
              a="Parkeo est un MVP local orienté Genève et alentours. L’objectif est d’étendre progressivement les zones et fonctionnalités."
            />
          </div>
        </section>

        {/* Footer link */}
        <section className="mt-12 text-center">
          <Link className={UI.link} href="/about">
            En savoir plus sur Parkeo →
          </Link>
        </section>
      </div>
    </main>
  );
}
