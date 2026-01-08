// app/sitemap.ts
import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

type ParkingRow = {
  id: string;
  created_at: string;
  is_active: boolean | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://parkeo.vercel.app";

  const now = new Date();

  // Pages statiques
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/map`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/parkings`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // Parkings dynamiques
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data } = await supabase
      .from("parkings")
      .select("id,created_at,is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(5000);

    const rows = (data ?? []) as ParkingRow[];

    const parkingRoutes: MetadataRoute.Sitemap = rows.map((p) => ({
      url: `${siteUrl}/parkings/${p.id}`,
      lastModified: p.created_at ? new Date(p.created_at) : now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...staticRoutes, ...parkingRoutes];
  } catch {
    // En cas d’erreur (env manquantes etc.), on renvoie au moins le statique
    return staticRoutes;
  }
}
