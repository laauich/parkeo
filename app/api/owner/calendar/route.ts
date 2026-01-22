// app/api/owner/calandar/route.ts
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

type ParkingJoin = {
  id: string;
  title: string | null;
  owner_id: string;
};

type RawBooking = {
  id: string;
  parking_id: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
  payment_status: string | null;
  total_price: string | number;
  currency: string | null;

  // ✅ Supabase join peut renvoyer objet OU tableau (selon config/typing)
  parkings: ParkingJoin | ParkingJoin[] | null;
};

function safeUpperCurrency(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return (s || "chf").toUpperCase();
}

function safeNumber(v: unknown) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Tolérant : accepte "YYYY-MM-DD" ou ISO complet
function isIsoLike(v: string) {
  if (!v) return false;
  // 2026-01-22 OR 2026-01-22T10:00:00Z OR with offset
  return /^\d{4}-\d{2}-\d{2}([T\s].*)?$/.test(v);
}

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

    // FullCalendar envoie généralement ISO; on garde un check souple
    if (!isIsoLike(start) || !isIsoLike(end)) {
      return NextResponse.json({ ok: false, error: "start/end invalides" }, { status: 400 });
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
    // On filtre sur start_time (view range). Si tu veux inclure les events qui chevauchent,
    // on pourrait aussi faire (start_time < end && end_time > start). Là on garde simple/performant.
    let q = admin
      .from("bookings")
      .select(
        "id,parking_id,start_time,end_time,status,payment_status,total_price,currency,parkings!inner(id,title,owner_id)"
      )
      .gte("start_time", start)
      .lt("start_time", end)
      .eq("parkings.owner_id", userId);

    if (parkingId !== "all") q = q.eq("parking_id", parkingId);

    // Option: ne montrer que les “actives”
    if (statusFilter !== "all") {
      q = q.in("status", ["pending_payment", "confirmed"]);
    }

    const { data, error } = await q.order("start_time", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = (data ?? []) as unknown as RawBooking[];

    const events = rows.map((b) => {
      // ✅ normalise join Supabase (objet vs tableau)
      const parking = Array.isArray(b.parkings) ? (b.parkings[0] ?? null) : (b.parkings ?? null);

      const parkingTitle = parking?.title ?? "Place";
      const st = (b.status ?? "unknown").toLowerCase();
      const pay = (b.payment_status ?? "unknown").toLowerCase();
      const cur = safeUpperCurrency(b.currency);

      const price = safeNumber(b.total_price);

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
        // NOTE: couleurs => à gérer côté client via classNames / eventClassNames
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
