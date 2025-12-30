import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    // ✅ Token depuis header Authorization
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Missing Authorization Bearer token" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      parkingId?: string;
      start?: string;
      end?: string;
      totalPrice?: number;
    };

    if (!body.parkingId || !body.start || !body.end || !body.totalPrice) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // ✅ 1) Vérifier l'user avec ANON (vrai contexte utilisateur)
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

    // ✅ 2) Insérer avec SERVICE ROLE (bypass RLS)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: u.user.id,
        parking_id: body.parkingId,
        start_time: body.start,
        end_time: body.end,
        total_price: body.totalPrice,
        status: "pending",
        payment_status: "unpaid",
      })
      .select("id")
      .single();

    if (bErr || !booking) {
      return NextResponse.json(
        { error: "Insert booking failed", detail: bErr?.message ?? "No booking" },
        { status: 500 }
      );
    }

    return NextResponse.json({ bookingId: booking.id }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
