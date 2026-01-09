// app/parkings/[id]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";
import { UI } from "@/app/components/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://parkeo.ch";

  if (!p) {
    return {
      title: "Place introuvable",
      description: "Cette place de parking n’existe pas ou n’est plus active.",
      alternates: { canonical: `/parkings/${id}` },
      openGraph: {
        title: "Place introuvable | Parkeo",
        description: "Cette place de parking n’existe pas ou n’est plus active.",
        url: `${siteUrl}/parkings/${id}`,
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "Place introuvable | Parkeo",
        description: "Cette place de parking n’existe pas ou n’est plus active.",
      },
    };
  }

  const addr = fullAddress(p);
  const title = `${p.title} – Parking à Genève`;
  const desc = `Réservez cette place de parking à Genève. ${
    addr ? `Adresse : ${addr}. ` : ""
  }Prix : ${p.price_hour} CHF/h${p.price_day ? `, ${p.price_day} CHF/j` : ""}.`;

  const ogImage = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : null;

  return {
    title,
    description: desc,
    alternates: { canonical: `/parkings/${p.id}` },
    openGraph: {
      title: `${p.title} | Parkeo`,
      description: desc,
      url: `${siteUrl}/parkings/${p.id}`,
      type: "website",
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1200,
              height: 630,
              alt: p.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: `${p.title} | Parkeo`,
      description: desc,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function Badge({ children }: { children: React.ReactNode }) {
  // ✅ harmonisé avec ton design
  return <span className={UI.chip}>{children}</span>;
}

export default async function ParkingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://parkeo.ch";

  const { id } = await params;
  const p = await getParking(id);

  if (!p) {
    return (
      <main className={UI.page}>
        <div className={[UI.container, UI.section].join(" ")}>
          <div className={[UI.card, UI.cardPad, "space-y-3"].join(" ")}>
            <p className="text-sm text-rose-600 font-medium">Parking introuvable.</p>
            <Link className={UI.link} href="/parkings">
              ← Retour aux parkings
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const canonicalUrl = `${siteUrl}/parkings/${p.id}`;
  const addr = fullAddress(p);
  const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
  const city = p.city ?? "Genève";

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Parkings à Genève", item: `${siteUrl}/parkings` },
      { "@type": "ListItem", position: 3, name: p.title, item: canonicalUrl },
    ],
  };

  const parkingLd = {
    "@context": "https://schema.org",
    "@type": "ParkingFacility",
    "@id": canonicalUrl,
    name: p.title,
    url: canonicalUrl,
    image: photos.length ? photos : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: addr || undefined,
      addressLocality: city,
      addressCountry: "CH",
    },
    geo:
      typeof p.lat === "number" && typeof p.lng === "number"
        ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng }
        : undefined,
    amenityFeature: [
      p.is_covered != null
        ? { "@type": "LocationFeatureSpecification", name: "Couvert", value: Boolean(p.is_covered) }
        : null,
      p.has_ev_charger
        ? { "@type": "LocationFeatureSpecification", name: "Borne de recharge (EV)", value: true }
        : null,
      p.is_secure
        ? { "@type": "LocationFeatureSpecification", name: "Sécurisé", value: true }
        : null,
      p.is_lit
        ? { "@type": "LocationFeatureSpecification", name: "Éclairé", value: true }
        : null,
    ].filter(Boolean),
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "CHF",
      price: p.price_hour,
      availability: "https://schema.org/InStock",
      priceSpecification: [
        { "@type": "UnitPriceSpecification", priceCurrency: "CHF", price: p.price_hour, unitText: "HOUR" },
        ...(typeof p.price_day === "number"
          ? [{ "@type": "UnitPriceSpecification", priceCurrency: "CHF", price: p.price_day, unitText: "DAY" }]
          : []),
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(parkingLd) }}
      />

      <main className={UI.page}>
        <div className={[UI.container, UI.section].join(" ")}>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className={UI.h1}>{p.title}</h1>
              <p className={[UI.p, "mt-2"].join(" ")}>
                {addr || "Adresse non renseignée"}
              </p>
            </div>

            <Link className={UI.link} href="/parkings">
              ← Retour
            </Link>
          </div>

          {/* Photos */}
          {photos.length > 0 ? (
            <section className={[UI.card, UI.cardPad, "mt-6"].join(" ")}>
              <div className="flex items-center justify-between gap-3">
                <h2 className={UI.h2}>Photos</h2>
                <span className={UI.chip}>{photos.length} photo(s)</span>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {photos.slice(0, 6).map((url) => (
                  <div
                    key={url}
                    className="rounded-2xl overflow-hidden border border-slate-200/70 bg-slate-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-44 object-cover" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Content grid */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left */}
            <section className="lg:col-span-2 space-y-4">
              <div className={[UI.card, UI.cardPad, "space-y-3"].join(" ")}>
                <div className="text-sm text-slate-600">Adresse</div>
                <div className="text-base text-slate-900">{addr}</div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge>{typeLabel(p.parking_type)}</Badge>
                  <Badge>{p.is_covered ? "Couverte" : "Non couverte"}</Badge>
                  {p.has_ev_charger ? <Badge>⚡ Borne EV</Badge> : null}
                  {p.is_secure ? <Badge>🔒 Sécurisé</Badge> : null}
                  {p.is_lit ? <Badge>💡 Éclairé</Badge> : null}
                </div>

                <div className="pt-3 text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Prix :</span>{" "}
                  {p.price_hour} CHF / h
                  {p.price_day ? ` · ${p.price_day} CHF / jour` : ""}
                </div>
              </div>

              {p.instructions ? (
                <div className={[UI.card, UI.cardPad].join(" ")}>
                  <h2 className={UI.h2}>Instructions</h2>
                  <p className={[UI.p, "mt-2 whitespace-pre-wrap"].join(" ")}>
                    {p.instructions}
                  </p>
                </div>
              ) : null}
            </section>

            {/* Right */}
            <aside className={[UI.card, UI.cardPad, "space-y-3 h-fit"].join(" ")}>
              <h2 className={UI.h2}>Réserver</h2>
              <p className={UI.p}>Choisis une date/heure, puis paie pour confirmer.</p>

              <BookingForm
                parkingId={p.id}
                parkingTitle={p.title}
                priceHour={Number(p.price_hour)}
                priceDay={p.price_day ? Number(p.price_day) : null}
              />
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
