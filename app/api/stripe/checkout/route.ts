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

export async function POST(req: Request) {
  try {
    const stripeKey = getEnv("STRIPE_SECRET_KEY");
    const appUrl = getEnv("NEXT_PUBLIC_APP_URL");

    if (!stripeKey) {
      return NextResponse.json(
        { ok: false, where: "env", error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }
    if (!appUrl) {
      return NextResponse.json(
        { ok: false, where: "env", error: "Missing NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey);

    const body = (await req.json()) as Body;

    if (!body.bookingId || !body.parkingTitle || !body.amountChf) {
      return NextResponse.json(
        { ok: false, where: "body", error: "Missing fields" },
        { status: 400 }
      );
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

    return NextResponse.json({ ok: true, url: session.url }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, where: "exception", error: msg },
      { status: 500 }
    );
  }
}

