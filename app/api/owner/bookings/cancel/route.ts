// app/api/owner/bookings/cancel/route.ts
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

type ApiOk = { ok: true; refunded?: boolean; already?: boolean };
type ApiErr = { ok: false; error: string; detail?: string };

function jsonOk(payload: ApiOk, status = 200) {
  return NextResponse.json(payload, { status });
}

function jsonErr(error: string, status = 400, detail?: string) {
  const payload: ApiErr = { ok: false, error, ...(detail ? { detail } : {}) };
  return NextResponse.json(payload, { status });
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = env("STRIPE_SECRET_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return jsonErr("Unauthorized", 401, "Missing Authorization Bearer token");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const bookingId = body.bookingId?.trim();
    if (!bookingId) return jsonErr("bookingId manquant", 400);

    // Auth user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return jsonErr("Unauthorized", 401, uErr?.message ?? "No user");
    }

    // Admin
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Load booking (include times + amount for email)
    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, parking_id, user_id, start_time, end_time, total_price, currency, status, payment_status, stripe_payment_intent_id, refund_id, refund_status"
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) return jsonErr("DB error", 500, bErr.message);
    if (!booking) return jsonErr("Booking not found", 404);

    // Load parking owner + title/address for email
    const { data: p, error: pErr } = await supabaseAdmin
      .from("parkings")
      .select("id, owner_id, title, address")
      .eq("id", booking.parking_id)
      .maybeSingle();

    if (pErr) return jsonErr("DB error", 500, pErr.message);
    if (!p) return jsonErr("Parking not found", 404);

    if (p.owner_id !== u.user.id) return jsonErr("Forbidden", 403);

    // Already cancelled
    if ((booking.status ?? "").toLowerCase() === "cancelled") {
      // ✅ pas d’email en already
      return jsonOk({ ok: true, already: true }, 200);
    }

    const paid = (booking.payment_status ?? "").toLowerCase() === "paid";

    // Cancel booking first (effective cancellation)
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

    if (upErr) return jsonErr("Update failed", 500, upErr.message);

    // ✅ SOLUTION 1: emails UNIQUEMENT APRÈS annulation DB ok
    try {
      const ownerEmail = u.user.email ?? null;

      let clientEmail: string | null = null;
      if (booking.user_id) {
        const client = await supabaseAdmin.auth.admin.getUserById(booking.user_id);
        clientEmail = client.data?.user?.email ?? null;
      }

      const parkingTitle = p.title ?? "Place";
      const parkingAddress = p.address ?? null;

      if (ownerEmail) {
        await sendEmail({
          to: ownerEmail,
          subject: "Annulation confirmée (propriétaire) — Parkeo",
          html: bookingCancelledOwnerEmailHtml({
            cancelledBy: "owner",
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

      if (clientEmail) {
        await sendEmail({
          to: clientEmail,
          subject: "Votre réservation a été annulée par le propriétaire — Parkeo",
          html: bookingCancelledClientEmailHtml({
            cancelledBy: "owner",
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
      console.error("Cancel emails (owner) failed:", e);
    }

    // If not paid, done
    if (!paid) return jsonOk({ ok: true, refunded: false }, 200);

    // Paid: need refund
    if (!booking.stripe_payment_intent_id) {
      // best-effort rollback
      await supabaseAdmin
        .from("bookings")
        .update({ refund_status: "missing_intent", payment_status: "paid" })
        .eq("id", booking.id);

      return jsonErr("Refund impossible", 500, "stripe_payment_intent_id manquant");
    }

    // Idempotency: if refund already exists in DB, don't recreate
    if (booking.refund_id || (booking.refund_status ?? "").toLowerCase() === "refunded") {
      return jsonOk({ ok: true, refunded: true, already: true }, 200);
    }

    const stripe = new Stripe(stripeKey);

    try {
      const refund = await stripe.refunds.create(
        { payment_intent: booking.stripe_payment_intent_id },
        { idempotencyKey: `owner-cancel-${booking.id}` }
      );

      const { error: upd2Err } = await supabaseAdmin
        .from("bookings")
        .update({
          refund_status: "refunded",
          refund_id: refund.id,
          payment_status: "refunded",
        })
        .eq("id", booking.id);

      if (upd2Err) {
        return jsonErr("Refund ok but DB update failed", 500, upd2Err.message);
      }

      return jsonOk({ ok: true, refunded: true }, 200);
    } catch (e: unknown) {
      await supabaseAdmin
        .from("bookings")
        .update({
          refund_status: "failed",
          payment_status: "paid",
        })
        .eq("id", booking.id);

      const msg = e instanceof Error ? e.message : "Stripe refund failed";
      return jsonErr("Stripe refund failed", 502, msg);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
