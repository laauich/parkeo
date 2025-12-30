import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        {
          error: "Server misconfigured",
          detail:
            "Missing env var(s). Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
          env: {
            hasUrl: !!supabaseUrl,
            hasAnon: !!anonKey,
            hasService: !!serviceKey,
          },
        },
        { status: 500 }
      );
    }

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    

    const body = (await req.json()) as {
      parkingId?: string;
      start?: string;
      end?: string;
      totalPrice?: number;
    };

    if (!body.parkingId || !body.start || !body.end || !body.totalPrice) {
      return NextResponse.json(
        { error: "Bad request", detail: "Missing fields" },
        { status: 400 }
      );
    }

    // 1) Vérifier l'utilisateur avec le token (client anon + header Authorization)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();

    if (uErr || !u.user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          detail: uErr?.message ?? "No user returned by Supabase",
          hint:
            "Souvent: token invalide OU Vercel pointe vers un autre projet Supabase (URL/ANON différentes).",
          debug: {
            supabaseUrl,
            tokenLooksPresent: token ? token.length > 20 : false,
          },
        },
        { status: 401 }
      );
    }

    // 2) Insérer avec service role
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
