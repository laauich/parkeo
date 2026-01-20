// app/api/owner/availability/upsert/route.ts
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type Slot = {
  weekday: number; // 1..7
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  enabled: boolean;
};

type Body = {
  parkingId?: string;
  slots?: Slot[];
};

function isTime(v: string) {
  // accept HH:MM or HH:MM:SS
  return /^\d{2}:\d{2}(:\d{2})?$/.test(v);
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;

    const parkingIdRaw = (body.parkingId ?? "").trim();

    // ✅ FIX IMPORTANT: refuse "undefined"
    if (!parkingIdRaw || parkingIdRaw === "undefined" || !isUuid(parkingIdRaw)) {
      return NextResponse.json({ ok: false, error: "parkingId invalide" }, { status: 400 });
    }

    const slots = Array.isArray(body.slots) ? body.slots : [];

    // validate slots
    for (const s of slots) {
      if (!s || typeof s.weekday !== "number") {
        return NextResponse.json({ ok: false, error: "slots invalides" }, { status: 400 });
      }
      if (s.weekday < 1 || s.weekday > 7) {
        return NextResponse.json({ ok: false, error: "weekday invalide" }, { status: 400 });
      }
      if (!isTime(String(s.start_time)) || !isTime(String(s.end_time))) {
        return NextResponse.json({ ok: false, error: "Heures invalides" }, { status: 400 });
      }
      if (Boolean(s.enabled) && String(s.end_time) <= String(s.start_time)) {
        return NextResponse.json({ ok: false, error: "end_time doit être après start_time" }, { status: 400 });
      }
    }

    // user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = u.user.id;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ✅ verify owner
    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,owner_id")
      .eq("id", parkingIdRaw)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ ok: false, error: "Parking introuvable" }, { status: 404 });
    if ((p as { owner_id: string }).owner_id !== userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // ✅ Strategy simple & safe: on remplace tout
    const { error: delErr } = await admin
      .from("parking_availability")
      .delete()
      .eq("parking_id", parkingIdRaw);

    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

    if (slots.length === 0) {
      // planning vide => fallback (pas bloquant) => OK
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const rows = slots.map((s) => ({
      parking_id: parkingIdRaw,
      weekday: s.weekday,
      start_time: s.start_time,
      end_time: s.end_time,
      enabled: Boolean(s.enabled),
    }));

    const { error: insErr } = await admin.from("parking_availability").insert(rows);
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
