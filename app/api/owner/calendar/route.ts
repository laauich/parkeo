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

type DbBooking = {
  id: string;
  parking_id: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
  payment_status: string | null;
  total_price: string | number;
  currency: string | null;
  parkings?: {
    id: string;
    title: string | null;
    owner_id: string;
  } | null;
};

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const start = (url.searchParams.get("start") || "").trim();
    const end = (url.searchParams.get("end") || "").trim();
    const parkingId = (url.searchParams.get("parkingId") || "all").trim();
    const statusFilter = (url.searchParams.get("status") || "active").trim();
    // statusFilter:
    // - "active" = pending_payment + confirmed
    // - "all" = tout

    if (!start || !end) {
      return NextResponse.json({ ok: false, error: "start/end requis" }, { status: 400 });
    }

    if (parkingId !== "all" && !isUuid(parkingId)) {
      return NextResponse.json({ ok: false, error: "parkingId invalide" }, { status: 400 });
    }

    // Auth user (via anon + bearer)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = u.user.id;

    // Admin (service role) pour join + contrôle
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Query bookings dans la plage visible
    // On filtre sur start_time. (FullCalendar fournit start/end de la view)
    // IMPORTANT: on joint parkings pour vérifier owner_id = userId
    let q = admin
      .from("bookings")
      .select(
        "id,parking_id,start_time,end_time,status,payment_status,total_price,currency,parkings!inner(id,title,owner_id)"
      )
      .gte("start_time", start)
      .lt("start_time", end)
      .eq("parkings.owner_id", userId);

    if (parkingId !== "all") q = q.eq("parking_id", parkingId);

    // Option: ne montrer que les “actives” (celles qui bloquent la dispo)
    if (statusFilter !== "all") {
      q = q.in("status", ["pending_payment", "confirmed"]);
    }

    const { data, error } = await q.order("start_time", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = (data ?? []) as DbBooking[];

    const events = rows.map((b) => {
      const parkingTitle = b.parkings?.title ?? "Place";
      const st = b.status ?? "unknown";
      const pay = b.payment_status ?? "unknown";
      const cur = (b.currency ?? "chf").toUpperCase();

      const priceNum = typeof b.total_price === "string" ? Number(b.total_price) : Number(b.total_price);
      const price = Number.isFinite(priceNum) ? priceNum : null;

      // Titre court, lisible
      const title =
        st === "confirmed"
          ? `✅ ${parkingTitle}`
          : st === "pending_payment"
          ? `🕒 ${parkingTitle}`
          : `ℹ️ ${parkingTitle}`;

      return {
        id: b.id,
        title,
        start: b.start_time,
        end: b.end_time,
        extendedProps: {
          bookingId: b.id,
          parkingId: b.parking_id,
          parkingTitle,
          status: st,
          paymentStatus: pay,
          totalPrice: price,
          currency: cur,
        },
      };
    });

    return NextResponse.json({ ok: true, events }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
