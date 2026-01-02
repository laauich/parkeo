import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

type Body = {
  parkingId?: string;
  start?: string; // datetime-local
  end?: string;
  startTime?: string; // ISO
  endTime?: string;   // ISO
  totalPrice?: number;
  amountChf?: number;
  currency?: string;  // default CHF
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Missing Authorization Bearer token" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Body;

    const parkingId = body.parkingId;
    const startRaw = body.startTime ?? body.start;
    const endRaw = body.endTime ?? body.end;

    const total =
      typeof body.totalPrice === "number"
        ? body.totalPrice
        : typeof body.amountChf === "number"
        ? body.amountChf
        : null;

    if (!parkingId || !startRaw || !endRaw || total === null) {
      return NextResponse.json(
        {
          error: "Missing/invalid fields",
          expected: ["parkingId", "startTime|start", "endTime|end", "totalPrice|amountChf"],
          got: body,
        },
        { status: 400 }
      );
    }

    // 1) Auth: récupérer l’utilisateur à partir du token (anon)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json(
        { error: "Unauthorized", detail: uErr?.message ?? "No user" },
        { status: 401 }
      );
    }

    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
    }
    if (!(typeof total === "number") || Number.isNaN(total) || total <= 0) {
      return NextResponse.json({ error: "Invalid total price" }, { status: 400 });
    }

    // 2) Admin: overlap check + insert
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // overlap best-effort
    const { data: overlap, error: overlapErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("parking_id", parkingId)
      .in("status", ["pending_payment", "confirmed"])
      .lt("start_time", end.toISOString())
      .gt("end_time", start.toISOString())
      .limit(1);

    if (overlapErr) {
      return NextResponse.json({ error: overlapErr.message }, { status: 500 });
    }
    if (overlap && overlap.length > 0) {
      return NextResponse.json(
        { error: "Ce créneau est déjà réservé. Choisis un autre horaire." },
        { status: 409 }
      );
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: u.user.id,
        parking_id: parkingId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_price: total,
        currency: body.currency ?? "CHF",
        status: "pending_payment",
        payment_status: "unpaid",
      })
      .select("id,parking_id,status,payment_status,total_price,currency,start_time,end_time,created_at")
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        { error: insErr?.message ?? "Insert booking failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, booking: created, bookingId: created.id },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
