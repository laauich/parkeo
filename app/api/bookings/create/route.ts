// app/api/bookings/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string): string {
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

  start?: string; // datetime-local ou ISO
  end?: string;
  startTime?: string; // ISO
  endTime?: string; // ISO

  totalPrice?: number;
  amountChf?: number;

  currency?: string; // default "CHF"
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Missing Authorization: Bearer <token>" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Body;

    const parkingId = body.parkingId;
    const startRaw = body.startTime ?? body.start;
    const endRaw = body.endTime ?? body.end;

    const totalPrice =
      typeof body.totalPrice === "number"
        ? body.totalPrice
        : typeof body.amountChf === "number"
        ? body.amountChf
        : null;

    if (!parkingId || !startRaw || !endRaw || totalPrice === null) {
      return NextResponse.json(
        {
          error: "Missing/invalid fields",
          expected: ["parkingId", "startTime|start", "endTime|end", "totalPrice|amountChf"],
          got: body,
        },
        { status: 400 }
      );
    }

    // 1) Récupérer l'utilisateur depuis le token (client anon)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    const user = userData?.user;

    if (userErr || !user) {
      return NextResponse.json(
        { error: "Unauthorized", detail: userErr?.message ?? "No user" },
        { status: 401 }
      );
    }

    // 2) Valider les dates
    const start = new Date(startRaw);
    const end = new Date(endRaw);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
    }

    // 3) Admin client (service role)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 4) Overlap check
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

    // 5) Insert booking (⚠️ sans .single() => évite "Cannot coerce...")
    const { data: rows, error: insertErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: user.id,
        parking_id: parkingId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_price: totalPrice,
        currency: body.currency ?? "CHF",
        status: "pending_payment",
        payment_status: "unpaid",
      })
      .select("*");

    if (insertErr) {
      const msg = insertErr.message.toLowerCase();
      if (msg.includes("exclude") || msg.includes("conflict") || msg.includes("no_overlap")) {
        return NextResponse.json(
          { error: "Ce créneau vient d’être pris. Réessaie avec un autre horaire." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const created = Array.isArray(rows) ? rows[0] : null;
    if (!created) {
      // cas rare : insert ok mais rien retourné
      return NextResponse.json(
        { error: "Insert ok but no row returned (check RLS/returning)" },
        { status: 500 }
      );
    }

    return NextResponse.json({ booking: created, bookingId: created.id }, { status: 200 });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
