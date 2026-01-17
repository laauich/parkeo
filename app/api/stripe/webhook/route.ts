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

function optionalEnv(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

async function readRawBody(req: Request) {
  const ab = await req.arrayBuffer();
  return Buffer.from(ab);
}

function constructEventWithFallback(args: {
  stripe: Stripe;
  rawBody: Buffer;
  sig: string;
  secrets: string[];
}) {
  const { stripe, rawBody, sig, secrets } = args;
  let lastErr: unknown = null;

  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Invalid signature");
}

export async function POST(req: Request) {
  try {
    const stripeKey = env("STRIPE_SECRET_KEY");

    // ✅ 2 destinations -> 2 secrets -> 1 URL
    // Destination "Your account"
    const platformSecret = optionalEnv("STRIPE_WEBHOOK_SECRET");

    // Destination "Connected & v2 accounts"
    const connectSecret = optionalEnv("STRIPE_CONNECT_WEBHOOK_SECRET");

    if (!platformSecret && !connectSecret) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing webhook secrets. Set STRIPE_WEBHOOK_SECRET and/or STRIPE_CONNECT_WEBHOOK_SECRET",
        },
        { status: 500 }
      );
    }

    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    // ✅ IMPORTANT : ne pas forcer apiVersion ici -> évite tes erreurs TS ("...clover")
    const stripe = new Stripe(stripeKey);

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });
    }

    const rawBody = await readRawBody(req);

    let event: Stripe.Event;
    try {
      event = constructEventWithFallback({
        stripe,
        rawBody,
        sig,
        secrets: [platformSecret, connectSecret].filter(Boolean) as string[],
      });
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
        (typeof session.client_reference_id === "string" ? session.client_reference_id : undefined);

      if (!bookingId) {
        // ✅ 200 pour éviter les retries Stripe
        return NextResponse.json(
          { ok: true, warning: "Missing bookingId in metadata/client_reference_id" },
          { status: 200 }
        );
      }

      // ✅ Très important pour refunds owner/client
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
        // ✅ 200 quand même => pas de retry infini
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

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // -----------------------------
    // 3) Connect events (comptes propriétaires)
    // -----------------------------
    if (event.type === "account.updated" || event.type === "capability.updated") {
      const account = event.data.object as Stripe.Account;

      // ✅ Best-effort: si tes colonnes n'existent pas, on n'explose pas le webhook.
      try {
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_charges_enabled: account.charges_enabled ?? false,
            stripe_payouts_enabled: account.payouts_enabled ?? false,
            stripe_details_submitted: account.details_submitted ?? false,
            stripe_account_status_updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", account.id);
      } catch {
        // ignore
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (event.type === "payout.paid" || event.type === "payout.failed") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // -----------------------------
    // 4) Refund sync
    // -----------------------------
    if (event.type === "refund.updated") {
      const refund = event.data.object as Stripe.Refund;

      const pi =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id ?? null;

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

    // Default: ignore proprement
    return NextResponse.json({ ok: true, ignored: event.type }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
