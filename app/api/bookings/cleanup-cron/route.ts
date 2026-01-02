import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

export async function GET(req: Request) {
  try {
    const secret = env("CLEANUP_SECRET");

    // URL de base du site (prod)
    const base =
      (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "").replace(/\/+$/, "") ||
      "http://localhost:3000";

    // Appelle la route cleanup en interne
    const res = await fetch(`${base}/api/bookings/cleanup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cleanup-secret": secret,
      },
      body: "{}",
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      result: json,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
