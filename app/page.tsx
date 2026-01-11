// app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { UI } from "@/app/components/ui";

/* =========================
   SEO METADATA (HOME)
========================= */
export const metadata: Metadata = {
  title: "Parking à Genève – Réservez une place en ligne | Parkeo",
  description:
    "Trouvez et réservez une place de parking à Genève. Location à l’heure ou à la journée, particuliers et professionnels. Carte interactive, réservation rapide, paiement sécurisé.",
  alternates: { canonical: "https://parkeo.ch" },
  openGraph: {
    title: "Parking à Genève – Parkeo",
    description:
      "Réservation de places de parking à Genève. Carte interactive, réservation rapide, paiement sécurisé.",
    url: "https://parkeo.ch",
    siteName: "Parkeo",
    locale: "fr_CH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Parking à Genève – Parkeo",
    description:
      "Réservation de places de parking à Genève. Carte interactive, réservation rapide, paiement sécurisé.",
  },
};

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

  /* =========================
     JSON-LD (SEO)
  ========================= */
  const jsonLdWebsite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Parkeo",
    url: "https://parkeo.ch",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://parkeo.ch/parkings?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  const jsonLdBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Parkeo",
    url: "https://parkeo.ch",
    areaServed: { "@type": "City", name: "Genève" },
    description:
      "Plateforme de réservation et de location de places de parking à Genève.",
  };

  const jsonLdFAQ = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Puis-je réserver un parking à l’heure ?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Oui. Choisissez vos dates, Parkeo vérifie la disponibilité et vous pouvez réserver immédiatement.",
        },
      },
      {
        "@type": "Question",
        name: "Est-ce possible de réserver à la journée ?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Oui. Certaines places proposent un tarif journalier, affiché sur la fiche.",
        },
      },
      {
        "@type": "Question",
        name: "Je suis propriétaire : comment proposer ma place ?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Cliquez sur “Proposer ma place”, ajoutez l’adresse, la localisation sur la carte et des photos.",
        },
      },
      {
        "@type": "Question",
        name: "Où se situe Parkeo ?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Parkeo est un MVP local orienté Genève et alentours, avec une extension progressive des zones et fonctionnalités.",
        },
      },
    ],
  };

  const jsonLdItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: rows.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.title,
      url: `https://parkeo.ch/parkings/${p.id}`,
    })),
  };

  return (
    <>
      {/* JSON-LD (SEO) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebsite) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBusiness) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdItemList) }}
      />

      <main className={UI.page}>
        <div className={[UI.container, UI.section].join(" ")}>
          {/* HERO (image + CTA) */}
          <section
            className={[
              UI.card,
              UI.cardPad,
              "relative overflow-hidden",
              // ✅ hauteur + layout flex pour pousser les boutons en bas
              "min-h-[440px] sm:min-h-[520px] lg:min-h-[560px]",
              "flex flex-col",
            ].join(" ")}
          >
            {/* Background image */}
            <div className="pointer-events-none absolute inset-0">
              {/* Image plus visible */}
              <div
                className="absolute inset-0 bg-center bg-cover opacity-90"
                style={{ backgroundImage: "url(/home-bg.jpg)" }}
              />

              {/* Overlay contrasté (texte plus lisible) */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/35 to-white/65" />

              {/* Accents premium */}
              <div className="absolute -top-28 -right-28 h-96 w-96 rounded-full bg-violet-500/16 blur-3xl" />
              <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-fuchsia-400/14 blur-3xl" />
            </div>

            {/* ✅ Content full height */}
            <div className="relative flex flex-col flex-1 min-h-0">
              {/* Texte en haut */}
              <h1 className={[UI.h1, "mt-2 max-w-3xl text-slate-950"].join(" ")}>
                Réservez une place de parking à Genève, simplement.
              </h1>

              <p className={["mt-4 max-w-2xl text-slate-950/95"].join(" ")}>
                À l’heure ou à la journée. Trouvez une place disponible près de
                vous, et réservez en quelques clics.
              </p>

              {/* ✅ Boutons collés en bas */}
              <div className="mt-auto pt-10 flex flex-col sm:flex-row gap-3">
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
            </div>
          </section>

          {/* MODULES */}
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

            {/* ✅ Remplacement SEO des chips supprimées (hors image) */}
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              <li className={[UI.card, "px-4 py-3 text-sm text-slate-800"].join(" ")}>
                📍 Genève
              </li>
              <li className={[UI.card, "px-4 py-3 text-sm text-slate-800"].join(" ")}>
                🗺️ Carte interactive
              </li>
              <li className={[UI.card, "px-4 py-3 text-sm text-slate-800"].join(" ")}>
                🔒 Paiement sécurisé
              </li>
            </ul>
          </section>

          {/* PREVIEW */}
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

                      {/* ✅ même direction qu’avant, mais visuel bouton violet
                          ✅ pas de <Link> ici pour éviter <a> dans <a> */}
                      <div className="mt-4 flex items-center justify-between">
                        <span
                          className={[
                            UI.btnBase,
                            UI.btnPrimary,
                            "px-3 py-2 text-xs rounded-full",
                            "pointer-events-none select-none",
                          ].join(" ")}
                        >
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

          {/* SEO LOCAL */}
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
                  <b>location de places de parking à Genève</b>. Que vous
                  cherchiez un parking pour quelques heures, une journée ou
                  davantage, vous pouvez <b>réserver une place disponible</b> en
                  quelques clics, sans abonnement.
                </p>

                <p className={[UI.p, "mt-3"].join(" ")}>
                  Les zones les plus recherchées : <b>Genève centre</b>,{" "}
                  <b>Plainpalais</b>, <b>Eaux-Vives</b>, <b>Carouge</b> et
                  alentours. Passez par la carte pour repérer l’emplacement
                  exact, puis choisissez vos dates.
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
                    • Vérifiez les <b>instructions d’accès</b> (badge, portail,
                    étage, etc.).
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* FAQ */}
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
    </>
  );
}
