import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createBookingCheckoutSession,
  getAppUrl,
} from "@/app/lib/stripe";

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
  bookingId?: string;
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const bookingId = body.bookingId?.trim();
    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: "Missing/invalid fields", expected: ["bookingId"] },
        { status: 400 }
      );
    }

    // 1) Auth user (pour vérifier que c’est bien le client de la réservation)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 2) Admin (service role)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 3) Charger booking + parking (on prend le prix depuis la DB, pas depuis le client)
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select(
        `
        id,
        user_id,
        status,
        payment_status,
        total_price,
        currency,
        parking_id,
        parkings:parking_id ( id, title, owner_id )
      `
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: bErr.message }, { status: 500 });
    }
    if (!booking) {
      return NextResponse.json({ ok: false, error: "Booking introuvable" }, { status: 404 });
    }

    // Vérifier que c’est bien le client qui paie sa réservation
    if (booking.user_id !== u.user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Empêcher checkout si déjà payé / déjà remboursé / annulé
    const pay = (booking.payment_status ?? "").toLowerCase();
    const st = (booking.status ?? "").toLowerCase();

    if (pay === "paid" || pay === "refunded") {
      return NextResponse.json({ ok: false, error: "Booking déjà payé" }, { status: 409 });
    }
    if (st === "cancelled") {
      return NextResponse.json({ ok: false, error: "Booking annulé" }, { status: 409 });
    }

    const parking = Array.isArray(booking.parkings) ? booking.parkings[0] : booking.parkings;
    if (!parking?.owner_id) {
      return NextResponse.json({ ok: false, error: "Parking owner introuvable" }, { status: 500 });
    }

    // 4) Récupérer le compte Stripe Connect du propriétaire
    const { data: ownerProfile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled")
      .eq("id", parking.owner_id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });
    }

    const connectedAccountId = ownerProfile?.stripe_account_id ?? null;

    // IMPORTANT: si pas de compte connect => impossible de payer (car on doit transférer au owner)
    if (!connectedAccountId) {
      return NextResponse.json(
        { ok: false, error: "Owner Stripe non configuré", detail: "stripe_account_id manquant" },
        { status: 400 }
      );
    }

    // Optionnel mais conseillé: bloquer si onboarding/payouts pas OK
    if (!ownerProfile?.stripe_onboarding_complete || !ownerProfile?.stripe_payouts_enabled) {
      return NextResponse.json(
        {
          ok: false,
          error: "Owner Stripe incomplet",
          detail: "Le propriétaire doit finaliser 'Configurer mes paiements' (payouts).",
        },
        { status: 400 }
      );
    }

    // 5) Créer session Stripe Checkout via ton helper (15% automatique)
    //    -> on ne passe PAS platformFeeAmount => 15% par défaut
    const session = await createBookingCheckoutSession({
      bookingId: booking.id,
      parkingTitle: parking.title ?? "Réservation parking",
      amountTotal: typeof booking.total_price === "number" ? booking.total_price : 0,
      currency: booking.currency ?? "CHF",
      connectedAccountId,
      successPath: `/payment/success?bookingId=${encodeURIComponent(booking.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancelPath: `/payment/cancel?bookingId=${encodeURIComponent(booking.id)}`,
      customerEmail: u.user.email ?? null,
    });

    // 6) Sauvegarder la session ID (utile pour debug + retrieve)
    await admin
      .from("bookings")
      .update({
        stripe_session_id: session.id,
        status: "pending_payment",
        payment_status: "unpaid",
      })
      .eq("id", booking.id);

    return NextResponse.json({ ok: true, url: session.url }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
