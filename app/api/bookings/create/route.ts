import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  parkingId: string;
  start: string;
  end: string;
  totalPrice: number;
  accessToken: string;
};

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (
      !body.parkingId ||
      !body.start ||
      !body.end ||
      !body.totalPrice ||
      !body.accessToken
    ) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // ✅ Vérifier l'utilisateur à partir du token
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      body.accessToken
    );

    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;

    // ✅ Insert booking côté serveur (bypass RLS via service role)
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .insert({
        user_id: userId,
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
        { error: bErr?.message ?? "Insert booking failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ bookingId: booking.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
