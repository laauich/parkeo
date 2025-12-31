// app/api/bookings/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type CreateBookingBody = {
  userId: string;
  parkingId: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  totalPrice: number;
  currency?: string; // default "CHF"
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CreateBookingBody>;
    const { userId, parkingId, startTime, endTime, totalPrice } = body;

    if (!userId || !parkingId || !startTime || !endTime || typeof totalPrice !== "number") {
      return NextResponse.json({ error: "Missing/invalid fields" }, { status: 400 });
    }

    // Validation temps (minimum)
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
    }

    // (Optionnel) arrondi/minimum ici si tu veux

    // ---- Option A: advisory lock + overlap check (utile même si Option B existe)
    // Advisory locks sont par transaction, mais via supabase-js on ne contrôle pas une transaction facilement.
    // Donc soit tu relies sur Option B (contraintes DB), soit tu fais overlap check simple (moins "béton").
    // -> Pour rester simple et robuste : on fait un overlap check + on s'appuie sur Option B si activée.

    // Overlap check "best effort" (évite beaucoup de conflits)
    const { data: overlap, error: overlapErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("parking_id", parkingId)
      .in("status", ["pending_payment", "confirmed"])
      .lt("start_time", end.toISOString())  // existing.start < new.end
      .gt("end_time", start.toISOString())  // existing.end > new.start
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

    // Créer le booking en pending_payment
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: userId,
        parking_id: parkingId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_price: totalPrice,
        currency: body.currency ?? "CHF",
        status: "pending_payment",
        payment_status: "unpaid",
        // Optionnel: expires_at: new Date(Date.now()+10*60*1000).toISOString()
      })
      .select("*")
      .single();

    if (insertErr) {
      // Si Option B (EXCLUDE) est en place, une collision arrivera ici même si le check est passé.
      // On renvoie 409 proprement.
      const msg = insertErr.message.toLowerCase();
      if (msg.includes("bookings_no_overlap") || msg.includes("exclude") || msg.includes("conflict")) {
        return NextResponse.json(
          { error: "Ce créneau vient d’être pris par quelqu’un d’autre. Réessaie avec un autre horaire." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ booking: created }, { status: 200 });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
