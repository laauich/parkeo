import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

function siteUrl() {
  // Recommandé : NEXT_PUBLIC_SITE_URL dans Vercel
  // En dev: http://localhost:3000
  const v = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (v) return v.replace(/\/+$/, "");
  return "http://localhost:3000";
}

type Body = {
  bookingId?: string;
  parkingTitle?: string;
  amountChf?: number; // CHF
  currency?: string; // "chf"
};

export async function POST(req: Request) {
  try {
    const stripeKey = env("STRIPE_SECRET_KEY");
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const body = (await req.json()) as Body;
    const bookingId = body.bookingId;
    const amountChf = typeof body.amountChf === "number" ? body.amountChf : null;

    if (!bookingId || amountChf === null || Number.isNaN(amountChf) || amountChf <= 0) {
      return NextResponse.json(
        { error: "Missing/invalid fields", expected: ["bookingId", "amountChf>0"] },
        { status: 400 }
      );
    }

    const currency = (body.currency ?? "chf").toLowerCase();
    const amountCents = Math.round(amountChf * 100);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });

    // On récupère la réservation pour vérifier qu'elle existe
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id,status,payment_status,total_price,currency,parking_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) {
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    }
    if (!booking) {
      return NextResponse.json({ error: "Booking introuvable" }, { status: 404 });
    }

    // Optionnel : empêcher checkout si déjà payé
    if (booking.payment_status === "paid") {
      return NextResponse.json(
        { error: "Booking déjà payé", bookingId },
        { status: 409 }
      );
    }

    const base = siteUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: body.parkingTitle
                ? `Réservation — ${body.parkingTitle}`
                : "Réservation parking",
              description: `Booking ${bookingId}`,
            },
          },
        },
      ],
      // IMPORTANT : URLs
      success_url: `${base}/payment/success?bookingId=${encodeURIComponent(
        bookingId
      )}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/payment/cancel?bookingId=${encodeURIComponent(
        bookingId
      )}`,

      // Metadata utile webhook
      metadata: {
        bookingId,
      },
    });
// Sauvegarde la session Stripe sur le booking (pour refunds)
await supabaseAdmin
  .from("bookings")
  .update({ stripe_session_id: session.id })
  .eq("id", bookingId);

    // Sauvegarde session_id dans booking (pratique)
    await supabaseAdmin
      .from("bookings")
      .update({
        stripe_session_id: session.id,
        status: "pending_payment",
        payment_status: "unpaid",
      })
      .eq("id", bookingId);

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
