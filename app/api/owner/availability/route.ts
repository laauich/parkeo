// app/api/owner/availability/route.ts
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

type AvailabilityRow = {
  id: string;
  parking_id: string;
  weekday: number; // 1..7
  start_time: string; // "HH:MM:SS"
  end_time: string;   // "HH:MM:SS"
  enabled: boolean;
};

type PostBody = {
  parkingId?: string;
  // Remplacement complet :
  slots?: Array<{
    weekday: number; // 1..7
    startTime: string; // "HH:MM" ou "HH:MM:SS"
    endTime: string;   // "HH:MM" ou "HH:MM:SS"
    enabled?: boolean;
  }>;
};

function normalizeTime(t: string): string | null {
  // accepte "HH:MM" ou "HH:MM:SS"
  const s = (t ?? "").trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
}

function isValidWeekday(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const parkingId = (searchParams.get("parkingId") ?? "").trim();
    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" }, { status: 400 });

    // Client auth (RLS)
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("parking_availability")
      .select("id,parking_id,weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, rows: (data ?? []) as AvailabilityRow[] }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as PostBody;
    const parkingId = (body.parkingId ?? "").trim();
    const slots = Array.isArray(body.slots) ? body.slots : [];

    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" }, { status: 400 });
    if (slots.length === 0) {
      return NextResponse.json({ ok: false, error: "slots manquants" }, { status: 400 });
    }

    // Client auth (RLS)
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    // Validation + normalize
    const toInsert = slots.map((s) => {
      const weekday = Number(s.weekday);
      const start = normalizeTime(s.startTime);
      const end = normalizeTime(s.endTime);
      const enabled = s.enabled !== false;

      if (!isValidWeekday(weekday)) throw new Error(`weekday invalide: ${String(s.weekday)}`);
      if (!start || !end) throw new Error(`heure invalide (start/end)`);
      if (end <= start) throw new Error(`endTime doit être après startTime (weekday ${weekday})`);

      return {
        parking_id: parkingId,
        weekday,
        start_time: start,
        end_time: end,
        enabled,
      };
    });

    // Remplacement complet: delete puis insert
    const { error: delErr } = await supabase
      .from("parking_availability")
      .delete()
      .eq("parking_id", parkingId);

    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

    const { data: insData, error: insErr } = await supabase
      .from("parking_availability")
      .insert(toInsert)
      .select("id,parking_id,weekday,start_time,end_time,enabled");

    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, rows: insData ?? [] }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
