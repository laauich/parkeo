// /api/bookings/cancel/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import {
  sendEmail,
  bookingCancelledClientEmailHtml,
  bookingCancelledOwnerEmailHtml,
} from "@/app/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFUND_CUTOFF_HOURS = 12;

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

function hoursUntilStart(startIso: string) {
  const start = new Date(startIso).getTime();
  const now = Date.now();
  return (start - now) / (1000 * 60 * 60);
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

    const body = (await req.json().catch(() => ({}))) as Body;
    const bookingId = body.bookingId?.trim();
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

    // Load booking + parking info for email
    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select(
        "id,user_id,status,payment_status,start_time,end_time,total_price,currency,parking_id,stripe_payment_intent_id"
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: bErr.message }, { status: 500 });
    }
    if (!booking) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    if (booking.user_id !== u.user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if ((booking.status ?? "").toLowerCase() === "cancelled") {
      // ✅ pas d’email en already
      return NextResponse.json({ ok: true, already: true }, { status: 200 });
    }

    // Parking for emails (title/address + owner_id)
    const { data: parking, error: pErr } = await supabaseAdmin
      .from("parkings")
      .select("id,title,address,owner_id")
      .eq("id", booking.parking_id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });
    }

    const refundable =
      (booking.payment_status ?? "").toLowerCase() === "paid" &&
      hoursUntilStart(booking.start_time) >= REFUND_CUTOFF_HOURS;

    // Cancel booking in DB (this is the "effective cancellation")
    const { error: upErr } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        refund_status: refundable ? "requested" : "none",
        payment_status: refundable ? "refunding" : booking.payment_status,
        cancelled_by: "client",
      })
      .eq("id", booking.id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: "Update failed", detail: upErr.message }, { status: 500 });
    }

    // ✅ SOLUTION 1: envoyer emails UNIQUEMENT APRÈS annulation DB ok
    // Emails best-effort : si ça plante, on n’empêche pas l’annulation.
    try {
      // emails
      const clientEmail = u.user.email ?? null;

      // owner email
      let ownerEmail: string | null = null;
      if (parking?.owner_id) {
        const owner = await supabaseAdmin.auth.admin.getUserById(parking.owner_id);
        ownerEmail = owner.data?.user?.email ?? null;
      }

      const parkingTitle = parking?.title ?? "Place";
      const parkingAddress = parking?.address ?? null;

      if (clientEmail) {
        await sendEmail({
          to: clientEmail,
          subject: "Annulation confirmée — Parkeo",
          html: bookingCancelledClientEmailHtml({
            cancelledBy: "client",
            bookingId: booking.id,
            parkingTitle,
            parkingAddress,
            startTimeIso: booking.start_time,
            endTimeIso: booking.end_time,
            totalPrice: booking.total_price,
            currency: booking.currency,
          }),
        });
      }

      if (ownerEmail) {
        await sendEmail({
          to: ownerEmail,
          subject: "Le client a annulé une réservation — Parkeo",
          html: bookingCancelledOwnerEmailHtml({
            cancelledBy: "client",
            bookingId: booking.id,
            parkingTitle,
            parkingAddress,
            startTimeIso: booking.start_time,
            endTimeIso: booking.end_time,
            totalPrice: booking.total_price,
            currency: booking.currency,
          }),
        });
      }
    } catch (e) {
      console.error("Cancel emails (client) failed:", e);
    }

    // Refund if refundable (best effort)
    if (refundable && booking.stripe_payment_intent_id) {
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

    // No refund (or missing intent)
    if (refundable && !booking.stripe_payment_intent_id) {
      await supabaseAdmin
        .from("bookings")
        .update({
          refund_status: "missing_intent",
          payment_status: "paid",
        })
        .eq("id", booking.id);
    }

    return NextResponse.json({ ok: true, refunded: false }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
