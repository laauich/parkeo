// app/parkings/[id]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = "https://parkeo.ch"; // ✅ change ici si besoin

type ParkingRow = {
  id: string;
  title: string;
  instructions: string | null;

  address: string;

  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  parking_type: "outdoor" | "indoor" | "garage" | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  price_hour: number;
  price_day: number | null;

  photos: string[] | null;

  lat: number | null;
  lng: number | null;

  is_active: boolean | null;
};

function typeLabel(t: ParkingRow["parking_type"]) {
  if (t === "indoor") return "Intérieur";
  if (t === "garage") return "Garage";
  return "Extérieur";
}

function fullAddress(p: ParkingRow) {
  const a = (p.address ?? "").trim();
  if (a) return a;

  const a1 = `${p.street ?? ""}${p.street_number ? " " + p.street_number : ""}`.trim();
  const a2 = `${p.postal_code ? p.postal_code + " " : ""}${p.city ?? ""}`.trim();
  return [a1, a2].filter(Boolean).join(", ");
}

async function getParking(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from("parkings")
    .select(
      "id,title,instructions,address,street,street_number,postal_code,city,parking_type,is_covered,has_ev_charger,is_secure,is_lit,price_hour,price_day,photos,lat,lng,is_active"
    )
    .eq("id", id)
    .maybeSingle();

  return (data ?? null) as ParkingRow | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getParking(id);

  if (!p) {
    return {
      title: "Place introuvable",
      description: "Cette place de parking n’existe pas ou n’est plus active.",
      alternates: { canonical: `/parkings/${id}` },
    };
  }

  const addr = fullAddress(p);
  const title = `${p.title} – Parking à Genève`;
  const desc = `Réservez cette place de parking à Genève. ${
    addr ? `Adresse : ${addr}. ` : ""
  }Prix : ${p.price_hour} CHF/h${p.price_day ? `, ${p.price_day} CHF/j` : ""}.`;

  return {
    title,
    description: desc,
    alternates: { canonical: `/parkings/${p.id}` },
    openGraph: {
      title: `${p.title} | Parkeo`,
      description: desc,
      url: `/parkings/${p.id}`,
      type: "website",
    },
  };
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs text-gray-700">
      {children}
    </span>
  );
}

export default async function ParkingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getParking(id);

  if (!p) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <p className="text-red-600">Parking introuvable.</p>
        <Link className="underline" href="/parkings">
          Retour
        </Link>
      </main>
    );
  }

  const addr = fullAddress(p);
  const url = `${SITE_URL}/parkings/${p.id}`;

  // ✅ JSON-LD: ParkingSpot + Offer (SEO)
  const jsonLdParkingSpot = {
    "@context": "https://schema.org",
    "@type": "ParkingFacility",
    "@id": url,
    name: p.title,
    url,
    description:
      p.instructions?.trim() ||
      `Place de parking à Genève. Réservation à l’heure ou à la journée.`,
    image: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos.slice(0, 6) : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: p.street
        ? `${p.street}${p.street_number ? " " + p.street_number : ""}`.trim()
        : addr,
      postalCode: p.postal_code ?? undefined,
      addressLocality: p.city ?? "Genève",
      addressCountry: "CH",
    },
    geo:
      typeof p.lat === "number" && typeof p.lng === "number"
        ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng }
        : undefined,
    amenityFeature: [
      p.is_covered
        ? { "@type": "LocationFeatureSpecification", name: "Couvert", value: true }
        : undefined,
      p.has_ev_charger
        ? { "@type": "LocationFeatureSpecification", name: "Borne EV", value: true }
        : undefined,
      p.is_secure
        ? { "@type": "LocationFeatureSpecification", name: "Sécurisé", value: true }
        : undefined,
      p.is_lit
        ? { "@type": "LocationFeatureSpecification", name: "Éclairé", value: true }
        : undefined,
    ].filter(Boolean),
    offers: [
      {
        "@type": "Offer",
        url,
        priceCurrency: "CHF",
        price: p.price_hour,
        priceSpecification: [
          {
            "@type": "UnitPriceSpecification",
            priceCurrency: "CHF",
            price: p.price_hour,
            unitCode: "HUR", // hour
          },
          ...(p.price_day
            ? [
                {
                  "@type": "UnitPriceSpecification",
                  priceCurrency: "CHF",
                  price: p.price_day,
                  unitCode: "DAY",
                },
              ]
            : []),
        ],
        availability: "https://schema.org/InStock",
      },
    ],
  };

  // ✅ JSON-LD FAQ (bonus SEO, simple et safe)
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Puis-je réserver à l’heure ?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Oui. Vous choisissez un début et une fin, puis vous payez pour confirmer la réservation.",
        },
      },
      {
        "@type": "Question",
        name: "Puis-je réserver à la journée ?",
        acceptedAnswer: {
          "@type": "Answer",
          text: p.price_day
            ? "Oui. Cette place propose un tarif journalier en plus du tarif horaire."
            : "Cela dépend de la place. Certaines proposent un tarif journalier en plus du tarif horaire.",
        },
      },
      {
        "@type": "Question",
        name: "Le paiement est-il sécurisé ?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Oui. Le paiement est réalisé via Stripe et la confirmation est automatique après paiement.",
        },
      },
    ],
  };

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* ✅ JSON-LD injecté (SEO) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdParkingSpot) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <Link className="underline" href="/parkings">
          ← Retour
        </Link>
      </div>

      {Array.isArray(p.photos) && p.photos.length > 0 ? (
        <section className="border rounded p-4">
          <h2 className="font-semibold mb-3">Photos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {p.photos.slice(0, 6).map((url) => (
              <div key={url} className="border rounded overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-44 object-cover" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          <div className="border rounded p-4 space-y-3">
            <div className="text-sm text-gray-600">Adresse</div>
            <div className="text-base">{fullAddress(p)}</div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Badge>{typeLabel(p.parking_type)}</Badge>
              {p.is_covered ? <Badge>Couvert</Badge> : <Badge>Non couvert</Badge>}
              {p.has_ev_charger ? <Badge>⚡ Borne EV</Badge> : null}
              {p.is_secure ? <Badge>🔒 Sécurisé</Badge> : null}
              {p.is_lit ? <Badge>💡 Éclairé</Badge> : null}
            </div>

            <div className="pt-3 text-sm">
              <span className="font-medium">Prix :</span> {p.price_hour} CHF / h
              {p.price_day ? ` · ${p.price_day} CHF / jour` : ""}
            </div>
          </div>

          {p.instructions ? (
            <div className="border rounded p-4">
              <h2 className="font-semibold">Instructions</h2>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                {p.instructions}
              </p>
            </div>
          ) : null}
        </section>

        <aside className="border rounded p-4 space-y-3 h-fit">
          <h2 className="text-lg font-semibold">Réserver</h2>
          <p className="text-sm text-gray-600">
            Choisis une date/heure, puis paie pour confirmer.
          </p>

          <BookingForm
            parkingId={p.id}
            parkingTitle={p.title}
            priceHour={Number(p.price_hour)}
            priceDay={p.price_day ? Number(p.price_day) : null}
          />
        </aside>
      </div>
    </main>
  );
}
