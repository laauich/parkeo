import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}
function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const ownerId = u.user.id;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data, error } = await admin
      .from("bookings")
      .select(`total_price, currency, status, payment_status, created_at, parkings:parking_id!inner(owner_id)`)
      .eq("parkings.owner_id", ownerId);

    if (error) return NextResponse.json({ ok: false, error: "DB error", detail: error.message }, { status: 500 });

    // Agrégation par YYYY-MM
    const map = new Map<string, number>();
    let currency = "CHF";

    for (const b of data ?? []) {
      const s = String(b.status ?? "").toLowerCase();
      const pay = String(b.payment_status ?? "").toLowerCase();
      if (s === "cancelled") continue;
      if (pay !== "paid") continue;

      currency = (b.currency ?? currency) as string;

      const dt = new Date(b.created_at as string);
      if (Number.isNaN(dt.getTime())) continue;

      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const amount = typeof b.total_price === "number" ? b.total_price : Number(b.total_price ?? 0);
      map.set(key, (map.get(key) ?? 0) + (Number.isFinite(amount) ? amount : 0));
    }

    const items = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12) // 12 derniers mois
      .map(([month, total]) => ({ month, total }));

    return NextResponse.json({ ok: true, currency: currency.toUpperCase(), items }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
