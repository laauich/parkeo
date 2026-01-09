// app/parkings/page.tsx
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import ParkingsClient from "./ParkingsClient";

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
  // ✅ Base URL (mets https://parkeo.ch quand ton domaine est actif)
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://parkeo.ch";

  // ✅ Fetch server-side (pour JSON-LD)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from("parkings")
    .select("id,title,address,city,price_hour,price_day,photos,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(24);

  const rows = (data ?? []) as ParkingLite[];

  // ✅ JSON-LD ItemList (schema.org)
  const jsonLd =
    rows.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Places de parking disponibles à Genève",
          "itemListOrder": "https://schema.org/ItemListOrderDescending",
          "numberOfItems": rows.length,
          "itemListElement": rows.map((p, idx) => {
            const url = `${siteUrl}/parkings/${p.id}`;
            const img = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
            const locality = p.city ?? "Genève";

            return {
              "@type": "ListItem",
              "position": idx + 1,
              "url": url,
              "item": {
                "@type": "ParkingFacility",
                "@id": url,
                "name": p.title,
                "url": url,
                "image": img.length ? img : undefined,
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": p.address ?? undefined,
                  "addressLocality": locality,
                  "addressCountry": "CH",
                },
                "offers":
                  typeof p.price_hour === "number"
                    ? {
                        "@type": "Offer",
                        "priceCurrency": "CHF",
                        "price": p.price_hour,
                        "availability": "https://schema.org/InStock",
                        "url": url,
                        "priceSpecification": [
                          {
                            "@type": "UnitPriceSpecification",
                            "priceCurrency": "CHF",
                            "price": p.price_hour,
                            "unitText": "HOUR",
                          },
                          ...(typeof p.price_day === "number"
                            ? [
                                {
                                  "@type": "UnitPriceSpecification",
                                  "priceCurrency": "CHF",
                                  "price": p.price_day,
                                  "unitText": "DAY",
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
      {/* ✅ JSON-LD pour Google */}
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <ParkingsClient />
    </>
  );
}
