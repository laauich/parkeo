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

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

type Body = { bookingId?: string };

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = env("STRIPE_SECRET_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: "Missing Authorization Bearer token" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Body;
    const bookingId = body.bookingId;
    if (!bookingId) {
      return NextResponse.json({ ok: false, error: "bookingId manquant" }, { status: 400 });
    }

    // Auth user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: uErr?.message ?? "No user" },
        { status: 401 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Load booking
    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id,parking_id,status,payment_status,stripe_payment_intent_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: bErr.message }, { status: 500 });
    }
    if (!booking) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    // Owner check
    const { data: p, error: pErr } = await supabaseAdmin
      .from("parkings")
      .select("owner_id")
      .eq("id", booking.parking_id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });
    }
    if (!p || p.owner_id !== u.user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ ok: true, already: true }, { status: 200 });
    }

    const paid = booking.payment_status === "paid";

    // Cancel booking (owner cancellation)
    const { error: upErr } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        refund_status: paid ? "requested_owner" : "none",
        payment_status: paid ? "refunding" : booking.payment_status,
        cancelled_by: "owner",
      })
      .eq("id", booking.id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: "Update failed", detail: upErr.message }, { status: 500 });
    }

    // ✅ Owner cancel => always refund if paid (if intent exists)
    if (paid && booking.stripe_payment_intent_id) {
      const stripe = new Stripe(stripeKey);
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
      });

      await supabaseAdmin
        .from("bookings")
        .update({
          refund_status: "refunded",
          refund_id: refund.id,
          payment_status: "refunded",
        })
        .eq("id", booking.id);

      return NextResponse.json({ ok: true, refunded: true }, { status: 200 });
    }

    if (paid && !booking.stripe_payment_intent_id) {
      await supabaseAdmin
        .from("bookings")
        .update({
          refund_status: "missing_intent",
          payment_status: "paid",
        })
        .eq("id", booking.id);

      return NextResponse.json(
        { ok: false, error: "Refund impossible", detail: "stripe_payment_intent_id manquant" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, refunded: false }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
