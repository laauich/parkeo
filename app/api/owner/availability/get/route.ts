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

type SlotRow = {
  weekday: number;
  start_time: string; // "HH:MM:SS" (postgres time)
  end_time: string;
  enabled: boolean;
};

function toHHMM(t: string) {
  // "HH:MM:SS" -> "HH:MM"
  return typeof t === "string" && t.length >= 5 ? t.slice(0, 5) : t;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const parkingId = (url.searchParams.get("parkingId") || "").trim();
    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" }, { status: 400 });

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,owner_id")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ ok: false, error: "Parking introuvable" }, { status: 404 });
    if ((p as { owner_id: string }).owner_id !== u.user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: rows, error: aErr } = await admin
      .from("parking_availability")
      .select("weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingId)
      .order("weekday", { ascending: true });

    if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

    const slots = ((rows ?? []) as SlotRow[]).map((r) => ({
      weekday: r.weekday,
      start_time: toHHMM(r.start_time),
      end_time: toHHMM(r.end_time),
      enabled: Boolean(r.enabled),
    }));

    return NextResponse.json({ ok: true, slots }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
