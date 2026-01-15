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

async function readRawBody(req: Request) {
  // Stripe signature => RAW BYTES (le plus safe)
  const ab = await req.arrayBuffer();
  return Buffer.from(ab);
}

export async function POST(req: Request) {
  try {
    const stripeKey = env("STRIPE_SECRET_KEY");
    const webhookSecret = env("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    // ⚠️ IMPORTANT
    // Mets une version stable, sinon tu risques des comportements inattendus.
    // Si tu veux garder la tienne, ok, mais je recommande une version standard.
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });


    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json(
        { ok: false, error: "Missing stripe-signature" },
        { status: 400 }
      );
    }

    const rawBody = await readRawBody(req);

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

    // -----------------------------
    // 1) Checkout payé => booking paid + confirmed + store payment_intent_id
    // -----------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const bookingId =
        (session.metadata?.bookingId as string | undefined) ??
        (typeof session.client_reference_id === "string"
          ? session.client_reference_id
          : undefined);

      if (!bookingId) {
        // ⚠️ On renvoie 200 pour éviter que Stripe retry en boucle
        return NextResponse.json(
          { ok: true, warning: "Missing bookingId in metadata/client_reference_id" },
          { status: 200 }
        );
      }

      // ✅ très important pour les refunds :
      // checkout.session.completed contient souvent payment_intent (string)
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
          stripe_payment_intent_id: paymentIntentId, // ✅ FIX REFUND
        })
        .eq("id", bookingId);

      if (error) {
        // ⚠️ 200 quand même (sinon Stripe retry et tu risques double update)
        return NextResponse.json({ ok: true, db_error: error.message }, { status: 200 });
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // -----------------------------
    // 2) Checkout expiré
    // -----------------------------
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId =
        (session.metadata?.bookingId as string | undefined) ??
        (typeof session.client_reference_id === "string"
          ? session.client_reference_id
          : undefined);

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

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // -----------------------------
    // 3) Connect: account.updated (optionnel mais recommandé)
    // Objectif: suivre si l’owner peut recevoir des payouts
    // -----------------------------
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;

      // Si tu stockes stripe_account_id dans "profiles" (ou "owners"), on peut mettre à jour
      // Adapte le nom de table/colonnes à ta DB.
      const stripeAccountId = account.id;

      // Exemple: profiles(stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
      // Si tu n'as pas ces colonnes, commente cette partie.
      await supabaseAdmin
        .from("profiles")
        .update({
          stripe_charges_enabled: account.charges_enabled ?? false,
          stripe_payouts_enabled: account.payouts_enabled ?? false,
          stripe_details_submitted: account.details_submitted ?? false,
          stripe_account_status_updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", stripeAccountId);

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // -----------------------------
    // 4) Refund: refund.updated (ou charge.refunded)
    // Ça permet de marquer "refunded" proprement côté bookings
    // -----------------------------
    if (event.type === "refund.updated") {
      const refund = event.data.object as Stripe.Refund;

      // refund.payment_intent peut être string
      const pi =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id ?? null;

      // On met à jour la réservation associée au payment_intent
      if (pi) {
        const status = refund.status; // "pending" | "succeeded" | "failed" | ...
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

      return NextResponse.json({ ok: true }, { status: 200 });
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

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Default: on ignore proprement
    return NextResponse.json({ ok: true, ignored: event.type }, { status: 200 });
  } catch (e: unknown) {
    // ⚠️ Ici on peut renvoyer 200 si tu veux éviter les retries Stripe,
    // mais je garde 500 car ça veut dire problème serveur.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
