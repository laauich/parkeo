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

function moneySafe(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    // user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const ownerId = u.user.id;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // On récupère les bookings payés de toutes les places du owner
    const { data, error } = await admin
      .from("bookings")
      .select(
        `
        id,
        total_price,
        currency,
        status,
        payment_status,
        end_time,
        owner_paid_out,
        parkings:parking_id!inner ( owner_id )
      `
      )
      .eq("parkings.owner_id", ownerId);

    if (error) return NextResponse.json({ ok: false, error: "DB error", detail: error.message }, { status: 500 });

    const now = Date.now();

    let pending = 0;
    let available = 0;
    let paidOut = 0;
    let currency = "CHF";

    for (const b of data ?? []) {
      const s = String(b.status ?? "").toLowerCase();
      const pay = String(b.payment_status ?? "").toLowerCase();
      const isCancelled = s === "cancelled";
      const isPaid = pay === "paid" || pay === "refunded" || pay === "refunding"; // payé initialement
      if (!isPaid || isCancelled) continue;

      currency = (b.currency ?? currency) as string;

      const amount = moneySafe(b.total_price);
      const endMs = new Date(b.end_time as string).getTime();
      const isPast = Number.isFinite(endMs) ? endMs <= now : false;

      if (b.owner_paid_out) {
        paidOut += amount;
      } else if (isPast) {
        available += amount;
      } else {
        pending += amount;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        currency: (currency ?? "CHF").toUpperCase(),
        pending,
        available,
        paidOut,
        total: pending + available + paidOut,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
