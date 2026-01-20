// app/api/owner/availability/get/route.ts
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

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const parkingIdRaw = (url.searchParams.get("parkingId") || "").trim();

    // ✅ FIX IMPORTANT: refuse "undefined"
    if (!parkingIdRaw || parkingIdRaw === "undefined" || !isUuid(parkingIdRaw)) {
      return NextResponse.json({ ok: false, error: "parkingId invalide" }, { status: 400 });
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

    const { data: slots, error: slErr } = await admin
      .from("parking_availability")
      .select("weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingIdRaw)
      .order("weekday", { ascending: true });

    if (slErr) return NextResponse.json({ ok: false, error: slErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, slots: slots ?? [] }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
