import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

type Body = {
  bookingId: string;
  parkingTitle: string;
  amountChf: number;
  currency?: string;
};

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

export async function POST(req: Request) {
  try {
    const stripeKey = getEnv("STRIPE_SECRET_KEY");
    const appUrl = getEnv("NEXT_PUBLIC_APP_URL");

    if (!stripeKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY (Vercel env var)" },
        { status: 500 }
      );
    }
    if (!appUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_APP_URL (Vercel env var)" },
        { status: 500 }
      );
    }

    // ✅ IMPORTANT: Stripe est créé ici (runtime), pas au build
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-12-15.clover",
    });

    const body = (await req.json()) as Body;

    if (!body.bookingId || !body.parkingTitle || !body.amountChf) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const currency = (body.currency ?? "chf").toLowerCase();
    const unitAmount = Math.round(body.amountChf * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: `Réservation : ${body.parkingTitle}`,
            },
          },
        },
      ],
      success_url: `${appUrl}/payment/success?bookingId=${encodeURIComponent(
        body.bookingId
      )}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/payment/cancel?bookingId=${encodeURIComponent(
        body.bookingId
      )}`,
      metadata: { bookingId: body.bookingId },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
