import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

function supabaseAdmin() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, serviceKey);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

export async function POST(req: Request) {
  try {
    const stripeKey = getEnv("STRIPE_SECRET_KEY");
    const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    if (!webhookSecret) {
      return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
    }

    // ⚠️ Important : Stripe signature vérifie le RAW body
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (e: unknown) {
      return NextResponse.json(
        { error: "Signature verification failed", detail: errorMessage(e) },
        { status: 400 }
      );
    }

    // ✅ Event principal : paiement terminé
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const bookingId = session.metadata?.bookingId ?? null;
      const sessionId = session.id;
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : null;

      if (bookingId) {
        const supabase = supabaseAdmin();

        const { error } = await supabase
          .from("bookings")
          .update({
            stripe_session_id: sessionId,
            stripe_payment_intent_id: paymentIntentId,
            payment_status: "paid",
            status: "confirmed",
            currency: session.currency ?? "chf",
          })
          .eq("id", bookingId);

        if (error) {
          return NextResponse.json(
            { error: "Supabase update failed", detail: error.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}