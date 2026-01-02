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

export async function POST(req: Request) {
  try {
    const stripeKey = env("STRIPE_SECRET_KEY");
    const webhookSecret = env("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    // ⚠️ Webhook: raw body obligatoire
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: unknown) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "Invalid signature" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // On gère le cas principal
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const bookingId =
        (session.metadata?.bookingId as string | undefined) ??
        (typeof session.client_reference_id === "string"
          ? session.client_reference_id
          : undefined);

      if (!bookingId) {
        return NextResponse.json({ ok: false, error: "Missing bookingId in metadata" }, { status: 200 });
      }

      // ✅ Marquer payé + confirmé
      const { error } = await supabaseAdmin
        .from("bookings")
        .update({
          payment_status: "paid",
          status: "confirmed",
          stripe_session_id: session.id,
        })
        .eq("id", bookingId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Optionnel: payment failed / expired
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId as string | undefined;
      if (bookingId) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "expired", payment_status: "unpaid", stripe_session_id: session.id })
          .eq("id", bookingId);
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: true, ignored: event.type }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
