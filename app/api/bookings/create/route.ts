import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/bookings/create
 * Crée une réservation en statut "pending_payment"
 * (le paiement Stripe confirmera ensuite)
 */
export async function POST(req: Request) {
  try {
    /* ===============================
       ENV
    =============================== */
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "ENV manquante: SUPABASE_SERVICE_ROLE_KEY ou URL" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    /* ===============================
       AUTH
    =============================== */
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization manquante" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !userData?.user) {
      return NextResponse.json(
        { error: "Utilisateur non authentifié" },
        { status: 401 }
      );
    }

    const user = userData.user;

    /* ===============================
       BODY
    =============================== */
    const body = await req.json().catch(() => null);

    const {
      parkingId,
      startTime,
      endTime,
      totalPrice,
      currency,
    } = body ?? {};

    if (
      !parkingId ||
      !startTime ||
      !endTime ||
      typeof totalPrice !== "number"
    ) {
      return NextResponse.json(
        { error: "Paramètres invalides" },
        { status: 400 }
      );
    }

    const startIso = new Date(startTime).toISOString();
    const endIso = new Date(endTime).toISOString();

    if (endIso <= startIso) {
      return NextResponse.json(
        { error: "La date de fin doit être après le début" },
        { status: 400 }
      );
    }

    /* ===============================
       INSERT BOOKING
       ⚠️ PAS DE .single()
    =============================== */
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: user.id,
        parking_id: parkingId,
        start_time: startIso,
        end_time: endIso,
        total_price: totalPrice,
        currency: currency ?? "CHF",
        status: "pending_payment",
        payment_status: "unpaid",
      })
      .select("id");

    if (error || !data || data.length === 0) {
      return NextResponse.json(
        {
          error: "Erreur création réservation",
          detail: error?.message,
        },
        { status: 500 }
      );
    }

    const bookingId = data[0].id;

    /* ===============================
       OK
    =============================== */
    return NextResponse.json(
      {
        ok: true,
        bookingId,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Erreur serveur",
        detail: err instanceof Error ? err.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
