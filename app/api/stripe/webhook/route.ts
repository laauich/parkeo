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

function envOptional(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

async function readRawBody(req: Request) {
  const ab = await req.arrayBuffer();
  return Buffer.from(ab);
}

function constructEventWithEitherSecret(args: {
  stripe: Stripe;
  rawBody: Buffer;
  signature: string;
  platformSecret: string;
  connectSecret?: string | null;
}): { event: Stripe.Event; source: "platform" | "connect" } {
  const { stripe, rawBody, signature, platformSecret, connectSecret } = args;

  // 1) tente avec secret plateforme
  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, platformSecret);
    return { event, source: "platform" };
  } catch {
    // ignore, on tente connect
  }

  // 2) tente avec secret connect si fourni
  if (connectSecret) {
    const event = stripe.webhooks.constructEvent(rawBody, signature, connectSecret);
    return { event, source: "connect" };
  }

  // 3) sinon erreur signature
  throw new Error("Invalid signature (platform secret failed, connect secret missing)");
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });
  }

  try {
    const stripeKey = env("STRIPE_SECRET_KEY");

    // ✅ 2 secrets : plateforme + connect
    const platformSecret = env("STRIPE_WEBHOOK_SECRET");
    const connectSecret = envOptional("STRIPE_CONNECT_WEBHOOK_SECRET");

    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    // ⚠️ Pas d'apiVersion ici (évite tes erreurs TS)
    const stripe = new Stripe(stripeKey);

    const rawBody = await readRawBody(req);

    let event: Stripe.Event;
    let source: "platform" | "connect";

    try {
      const res = constructEventWithEitherSecret({
        stripe,
        rawBody,
        signature: sig,
        platformSecret,
        connectSecret,
      });
      event = res.event;
      source = res.source;
    } catch (err: unknown) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "Invalid signature" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // -----------------------------
    // (A) Plateforme: Paiement réussi
    // -----------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const bookingId =
        (session.metadata?.bookingId as string | undefined) ??
        (typeof session.client_reference_id === "string" ? session.client_reference_id : undefined);

      if (!bookingId) {
        return NextResponse.json(
          { ok: true, warning: "Missing bookingId in metadata/client_reference_id", source },
          { status: 200 }
        );
      }

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      const { error } = await supabaseAdmin
        .from("bookings")
        .update({
          payment_status: "paid",
          status: "confirmed",
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
        })
        .eq("id", bookingId);

      if (error) {
        // ⚠️ 200 pour éviter les retries Stripe et les doubles updates
        return NextResponse.json({ ok: true, db_error: error.message, source }, { status: 200 });
      }

      return NextResponse.json({ ok: true, source }, { status: 200 });
    }

    // -----------------------------
    // (B) Plateforme: Checkout expiré
    // -----------------------------
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;

      const bookingId =
        (session.metadata?.bookingId as string | undefined) ??
        (typeof session.client_reference_id === "string" ? session.client_reference_id : undefined);

      if (bookingId) {
        await supabaseAdmin
          .from("bookings")
          .update({
            status: "expired",
            payment_status: "unpaid",
            stripe_session_id: session.id,
          })
          .eq("id", bookingId);
      }

      return NextResponse.json({ ok: true, source }, { status: 200 });
    }

    // -----------------------------
    // (C) Connect: suivi onboarding owner
    // -----------------------------
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;

      const stripeAccountId = account.id;
      const chargesEnabled = !!account.charges_enabled;
      const payoutsEnabled = !!account.payouts_enabled;
      const detailsSubmitted = !!account.details_submitted;

      // ✅ règle simple
      const onboardingComplete = detailsSubmitted && payoutsEnabled;

      await supabaseAdmin
        .from("profiles")
        .update({
          stripe_charges_enabled: chargesEnabled,
          stripe_payouts_enabled: payoutsEnabled,
          stripe_details_submitted: detailsSubmitted,
          stripe_onboarding_complete: onboardingComplete,
          stripe_updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", stripeAccountId);

      return NextResponse.json({ ok: true, source }, { status: 200 });
    }

    // -----------------------------
    // (D) Refund: mise à jour refund_status
    // -----------------------------
    if (event.type === "refund.updated") {
      const refund = event.data.object as Stripe.Refund;

      const pi =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id ?? null;

      if (pi) {
        const status = refund.status; // pending | succeeded | failed | ...
        const refundStatus =
          status === "succeeded" ? "refunded" : status === "failed" ? "failed" : "processing";

        await supabaseAdmin
          .from("bookings")
          .update({
            refund_status: refundStatus,
            refund_id: refund.id,
            payment_status: status === "succeeded" ? "refunded" : "refunding",
            refunded_at: status === "succeeded" ? new Date().toISOString() : null,
          })
          .eq("stripe_payment_intent_id", pi);
      }

      return NextResponse.json({ ok: true, source }, { status: 200 });
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;

      const pi =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;

      if (pi) {
        await supabaseAdmin
          .from("bookings")
          .update({
            refund_status: "refunded",
            payment_status: "refunded",
            refunded_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", pi);
      }

      return NextResponse.json({ ok: true, source }, { status: 200 });
    }

    // Default ignore
    return NextResponse.json({ ok: true, ignored: event.type, source }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
