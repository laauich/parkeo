// app/api/conversations/ensure/route.ts
import { NextResponse } from "next/server";
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

function isPast(endIso: string) {
  const end = new Date(endIso).getTime();
  if (Number.isNaN(end)) return false;
  return end <= Date.now();
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { bookingId?: string };
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
      return NextResponse.json({ ok: false, error: "Unauthorized", detail: uErr?.message ?? "No user" }, { status: 401 });
    }

    // Admin (service role)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Load booking (✅ on récupère status + end_time pour bloquer chat)
    const { data: b, error: bErr } = await admin
      .from("bookings")
      .select("id, parking_id, user_id, status, end_time")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) return NextResponse.json({ ok: false, error: "DB error", detail: bErr.message }, { status: 500 });
    if (!b) return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });

    // ✅ Bloque chat si annulée OU passée
    if ((b.status ?? "").toLowerCase() === "cancelled") {
      return NextResponse.json(
        { ok: false, error: "Chat indisponible", detail: "Réservation annulée" },
        { status: 409 }
      );
    }
    if (b.end_time && isPast(b.end_time)) {
      return NextResponse.json(
        { ok: false, error: "Chat indisponible", detail: "Réservation passée" },
        { status: 409 }
      );
    }

    // Load parking owner
    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("owner_id")
      .eq("id", b.parking_id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ ok: false, error: "Parking not found" }, { status: 404 });

    // Only booking client or parking owner can ensure it
    const isClient = u.user.id === b.user_id;
    const isOwner = u.user.id === p.owner_id;
    if (!isClient && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Upsert conversation (unique booking_id)
    const { data: conv, error: cErr } = await admin
      .from("conversations")
      .upsert(
        {
          booking_id: b.id,
          parking_id: b.parking_id,
          owner_id: p.owner_id,
          client_id: b.user_id,
        },
        { onConflict: "booking_id" }
      )
      .select("id")
      .maybeSingle();

    if (cErr) return NextResponse.json({ ok: false, error: "DB error", detail: cErr.message }, { status: 500 });
    if (!conv?.id) {
      return NextResponse.json({ ok: false, error: "Conversation not created" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, conversationId: conv.id }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
