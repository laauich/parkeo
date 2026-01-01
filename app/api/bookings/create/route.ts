// app/api/bookings/create/route.ts
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

type Body = {
  // accepte les 2 variantes
  parkingId?: string;
  start?: string;      // "YYYY-MM-DDTHH:mm" depuis input datetime-local
  end?: string;
  startTime?: string;  // ISO
  endTime?: string;    // ISO
  totalPrice?: number;
  amountChf?: number;  // au cas où ton front envoie ça
  currency?: string;
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

    // 1) Vérifier l’utilisateur via le token (client anon)
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

    // 2) Overlap check (best-effort)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: overlap, error: overlapErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("parking_id", parkingId)
      .in("status", ["pending_payment", "confirmed", "pending", "confirmed"]) // tolérant
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

    // 3) Insert booking
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: u.user.id,
        parking_id: parkingId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_price: totalPrice,
        currency: body.currency ?? "CHF",
        status: "pending_payment",
        payment_status: "unpaid",
      })
      .select("*")
      .single();

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

    return NextResponse.json(
  { booking: created, bookingId: created.id },
  { status: 200 }
);

  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

