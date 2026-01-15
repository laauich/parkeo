// app/api/bookings/cancel/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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

function isPast(endIso: string) {
  const end = new Date(endIso).getTime();
  if (Number.isNaN(end)) return false;
  return end <= Date.now();
}

type Body = { bookingId?: string };

type ApiOk = {
  ok: true;
  refunded?: boolean;
  already?: boolean;
  refund_status?: string;
};
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

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select(
        "id,user_id,status,payment_status,start_time,end_time,stripe_payment_intent_id,refund_status,refund_id"
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) return jsonErr("DB error", 500, bErr.message);
    if (!booking) return jsonErr("Booking not found", 404);

    if (booking.user_id !== u.user.id) return jsonErr("Forbidden", 403);

    // ✅ Déjà annulée => idempotent ok
    if ((booking.status ?? "").toLowerCase() === "cancelled") {
      return jsonOk({ ok: true, already: true, refunded: booking.refund_status === "refunded", refund_status: booking.refund_status ?? undefined }, 200);
    }

    // ✅ Interdit si passée
    if (booking.end_time && isPast(booking.end_time)) {
      return jsonErr("Annulation impossible", 409, "Réservation passée");
    }

    const refundable =
      (booking.payment_status ?? "").toLowerCase() === "paid" &&
      hoursUntilStart(booking.start_time) >= REFUND_CUTOFF_HOURS;

    // Cancel booking (cohérent)
    const nextRefundStatus = refundable ? "requested" : "none";
    const nextPaymentStatus =
      refundable ? "refunding" : booking.payment_status;

    const { error: upErr } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: "client",
        refund_status: nextRefundStatus,
        payment_status: nextPaymentStatus,
      })
      .eq("id", booking.id);

    if (upErr) return jsonErr("Update failed", 500, upErr.message);

    // Refund if refundable
    if (refundable) {
      // ✅ Si refund déjà présent => idempotent
      if (booking.refund_id || (booking.refund_status ?? "").toLowerCase() === "refunded") {
        return jsonOk({ ok: true, refunded: true, already: true, refund_status: "refunded" }, 200);
      }

      // ✅ Missing intent: ne renvoie PLUS 500, on marque missing_intent et on renvoie ok
      if (!booking.stripe_payment_intent_id) {
        await supabaseAdmin
          .from("bookings")
          .update({
            refund_status: "missing_intent",
            payment_status: "paid", // on remet paid car refund impossible
          })
          .eq("id", booking.id);

        return jsonOk({ ok: true, refunded: false, refund_status: "missing_intent" }, 200);
      }

      const stripe = new Stripe(stripeKey);

      try {
        const refund = await stripe.refunds.create(
          { payment_intent: booking.stripe_payment_intent_id },
          { idempotencyKey: `client-cancel-${booking.id}` }
        );

        await supabaseAdmin
          .from("bookings")
          .update({
            refund_status: "refunded",
            refund_id: refund.id,
            payment_status: "refunded",
          })
          .eq("id", booking.id);

        return jsonOk({ ok: true, refunded: true, refund_status: "refunded" }, 200);
      } catch (e: unknown) {
        // Refund failed: keep cancelled but reset payment/refund status coherently
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
    }

    return jsonOk({ ok: true, refunded: false, refund_status: nextRefundStatus }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
