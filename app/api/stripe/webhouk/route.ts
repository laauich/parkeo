import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

function supabaseAdmin() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) throw new Error("Missing Supabase env");
  return createClient(url, service, { auth: { persistSession: false } });
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

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }

    const rawBody = await req.text();
    const stripe = new Stripe(stripeKey);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (e: unknown) {
      return NextResponse.json(
        { error: "Signature verification failed", detail: errorMessage(e) },
        { status: 400 }
      );
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;

      if (bookingId) {
        const supabase = supabaseAdmin();

        const { error } = await supabase
          .from("bookings")
          .update({
            payment_status: "paid",
            status: "confirmed",
            stripe_session_id: session.id,
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
