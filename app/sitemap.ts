// app/sitemap.ts
import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

type ParkingRow = {
  id: string;
  updated_at?: string | null;
  created_at?: string | null;
  is_active?: boolean | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://parkeo.vercel.app";

  // Pages “statiques”
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/map`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/parkings`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // Parkings dynamiques
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("parkings")
    .select("id,updated_at,created_at,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error || !data) {
    // En cas d’erreur, on renvoie au moins le statique
    return staticRoutes;
  }

  const dynamicRoutes: MetadataRoute.Sitemap = (data as ParkingRow[]).map((p) => {
    const lm = p.updated_at ?? p.created_at ?? null;
    return {
      url: `${siteUrl}/parkings/${p.id}`,
      lastModified: lm ? new Date(lm) : new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    };
  });

  return [...staticRoutes, ...dynamicRoutes];
}
