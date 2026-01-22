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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "refunded" | string;

type BookingRow = {
  id: string;
  parking_id: string;
  user_id: string | null;
  start_time: string; // ISO
  end_time: string;   // ISO
  total_price: string | number;
  status: BookingStatus | null;
  payment_status: string | null;
  currency: string | null;
  created_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
};

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const parkingId = (url.searchParams.get("parkingId") || "").trim();
    const status = (url.searchParams.get("status") || "").trim(); // optional
    const from = (url.searchParams.get("from") || "").trim();     // optional ISO
    const to = (url.searchParams.get("to") || "").trim();         // optional ISO

    if (!parkingId || parkingId === "undefined" || !isUuid(parkingId)) {
      return NextResponse.json({ ok: false, error: "parkingId invalide" }, { status: 400 });
    }

    // Auth user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const userId = u.user.id;

    // Admin client
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Verify owner
    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id, owner_id")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ ok: false, error: "Parking introuvable" }, { status: 404 });
    if ((p as { owner_id: string }).owner_id !== userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    let q = admin
      .from("bookings")
      .select("id,parking_id,user_id,start_time,end_time,total_price,status,payment_status,currency,created_at,cancelled_at,refunded_at")
      .eq("parking_id", parkingId)
      .order("start_time", { ascending: true });

    // Optional filters
    if (status) q = q.eq("status", status);
    if (from) q = q.gte("start_time", from);
    if (to) q = q.lte("end_time", to);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, bookings: (data ?? []) as BookingRow[] }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
