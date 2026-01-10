// app/parkings/page.tsx
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import ParkingsClient, { type ParkingRow } from "./ParkingsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trouver une place de parking à Genève",
  description:
    "Liste des places de parking disponibles à Genève : filtre par type (extérieur, intérieur, garage), couverture, sécurité, éclairage, borne EV.",
  alternates: { canonical: "/parkings" },
  openGraph: {
    title: "Places de parking à Genève | Parkeo",
    description:
      "Trouvez une place de parking à Genève. Filtres utiles, photos, prix à l’heure et à la journée.",
    url: "/parkings",
    type: "website",
  },
};

type ParkingLite = {
  id: string;
  title: string;
  address: string | null;
  city: string | null;
  price_hour: number | null;
  price_day: number | null;
  photos: string[] | null;
  is_active: boolean | null;
};

export default async function ParkingsPage() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://parkeo.ch";

  // ✅ BreadcrumbList JSON-LD
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${siteUrl}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Parkings à Genève",
        item: `${siteUrl}/parkings`,
      },
    ],
  };

  // ✅ Fetch server-side (pour ItemList JSON-LD + SSR initialRows)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // On prend un dataset “suffisant” pour SSR + SEO; le client fera le refresh complet ensuite.
  const { data } = await supabase
    .from("parkings")
    .select(
      "id,title,street,street_number,postal_code,city,address,price_hour,price_day,parking_type,is_covered,has_ev_charger,is_secure,is_lit,photos,is_active"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(48);

  const initialRows = (data ?? []) as unknown as ParkingRow[];

  // ✅ ItemList JSON-LD (liste d’annonces) — version “lite” pour SEO
  const liteRows: ParkingLite[] = initialRows.map((p) => ({
    id: p.id,
    title: p.title,
    address: p.address ?? null,
    city: p.city ?? null,
    price_hour: p.price_hour ?? null,
    price_day: p.price_day ?? null,
    photos: Array.isArray(p.photos) ? p.photos : null,
    is_active: p.is_active ?? null,
  }));

  const itemListLd =
    liteRows.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Places de parking disponibles à Genève",
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: liteRows.length,
          itemListElement: liteRows.map((p, idx) => {
            const url = `${siteUrl}/parkings/${p.id}`;
            const img = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
            const locality = p.city ?? "Genève";

            return {
              "@type": "ListItem",
              position: idx + 1,
              url,
              item: {
                "@type": "ParkingFacility",
                "@id": url,
                name: p.title,
                url,
                image: img.length ? img : undefined,
                address: {
                  "@type": "PostalAddress",
                  streetAddress: p.address ?? undefined,
                  addressLocality: locality,
                  addressCountry: "CH",
                },
                offers:
                  typeof p.price_hour === "number"
                    ? {
                        "@type": "Offer",
                        priceCurrency: "CHF",
                        price: p.price_hour,
                        availability: "https://schema.org/InStock",
                        url,
                        priceSpecification: [
                          {
                            "@type": "UnitPriceSpecification",
                            priceCurrency: "CHF",
                            price: p.price_hour,
                            unitText: "HOUR",
                          },
                          ...(typeof p.price_day === "number"
                            ? [
                                {
                                  "@type": "UnitPriceSpecification",
                                  priceCurrency: "CHF",
                                  price: p.price_day,
                                  unitText: "DAY",
                                },
                              ]
                            : []),
                        ],
                      }
                    : undefined,
              },
            };
          }),
        }
      : null;

  return (
    <>
      {/* ✅ Breadcrumb JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* ✅ ItemList JSON-LD */}
      {itemListLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
        />
      ) : null}

      {/* ✅ SSR initialRows + refresh client pour rester à jour */}
      <ParkingsClient initialRows={initialRows} />
    </>
  );
}
