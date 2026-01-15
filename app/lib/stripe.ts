// app/lib/stripe.ts
import Stripe from "stripe";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

/**
 * ✅ IMPORTANT:
 * Ne PAS mettre apiVersion ici, sinon TS casse si ton SDK Stripe
 * typé n'accepte qu'une version (ex: "2025-12-15.clover").
 */
export const stripe = new Stripe(mustEnv("STRIPE_SECRET_KEY"));

export function toCents(amount: number) {
  return Math.round(amount * 100);
}

export function getAppUrl() {
  const base = mustEnv("APP_BASE_URL").replace(/\/$/, "");
  return base;
}

export function appUrl(path: string) {
  const base = getAppUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * ✅ Checkout + Stripe Connect (destination charge)
 * Parkeo encaisse, Stripe transfère automatiquement vers l’owner (acct_...)
 * Parkeo garde la commission via application_fee_amount
 */
export async function createBookingCheckoutSession(args: {
  bookingId: string;
  parkingTitle: string;

  amountTotal: number;
  currency?: string | null;

  connectedAccountId: string; // acct_...
  platformFeeAmount?: number; // commission Parkeo (même devise)
  successPath?: string;
  cancelPath?: string;

  customerEmail?: string | null;
}) {
  const currency = (args.currency ?? "CHF").toLowerCase();
  const totalCents = toCents(args.amountTotal);

  if (!args.connectedAccountId?.startsWith("acct_")) {
    throw new Error("connectedAccountId invalide (attendu acct_...)");
  }
  if (totalCents <= 0) throw new Error("Montant total invalide");

  const feeCents =
    args.platformFeeAmount != null ? Math.max(0, toCents(args.platformFeeAmount)) : 0;

  const applicationFeeAmount = Math.min(feeCents, totalCents);

  const successUrl = appUrl(args.successPath ?? "/my-bookings?success=1");
  const cancelUrl = appUrl(args.cancelPath ?? "/my-bookings?canceled=1");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,

    client_reference_id: args.bookingId,
    metadata: { bookingId: args.bookingId },

    customer_email: args.customerEmail ?? undefined,

    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: totalCents,
          product_data: {
            name: args.parkingTitle || "Réservation Parkeo",
          },
        },
      },
    ],

    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: args.connectedAccountId },
      metadata: {
        bookingId: args.bookingId,
        connectedAccountId: args.connectedAccountId,
      },
    },
  });

  return session;
}

export function extractPaymentIntentIdFromCheckoutSession(
  session: Stripe.Checkout.Session
): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  if (typeof pi === "string") return pi;
  return pi.id ?? null;
}

export async function retrieveCheckoutSessionWithPI(sessionId: string) {
  const s = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  const paymentIntentId = extractPaymentIntentIdFromCheckoutSession(s);
  return { session: s, paymentIntentId };
}
