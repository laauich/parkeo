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

type SlotIn = {
  weekday: number; // 1..7
  start_time: string; // "HH:mm" or "HH:mm:ss"
  end_time: string; // "HH:mm" or "HH:mm:ss"
  enabled: boolean;
};

function isTimeLike(s: unknown) {
  if (typeof s !== "string") return false;
  // accepte HH:mm ou HH:mm:ss
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s.trim());
}

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const m = Number(mm);
  return h * 60 + m;
}

function normalizeTime(t: string) {
  const s = t.trim();
  // transforme HH:mm => HH:mm:00
  if (/^\d\d:\d\d$/.test(s)) return `${s}:00`;
  return s;
}

function jsonErr(error: string, status = 400, detail?: string) {
  return NextResponse.json({ ok: false, error, ...(detail ? { detail } : {}) }, { status });
}

function jsonOk(payload: any, status = 200) {
  return NextResponse.json(payload, { status });
}

// GET /api/owner/availability?parkingId=<uuid>
export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return jsonErr("Unauthorized", 401, "Missing Authorization: Bearer <token>");

    const url = new URL(req.url);
    const parkingId = (url.searchParams.get("parkingId") || "").trim();
    if (!parkingId) return jsonErr("parkingId manquant", 400);

    // user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return jsonErr("Unauthorized", 401, uErr?.message ?? "No user");

    // admin (service role)
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // owner check
    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,owner_id")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return jsonErr("DB error", 500, pErr.message);
    if (!p) return jsonErr("Parking introuvable", 404);
    if (p.owner_id !== u.user.id) return jsonErr("Forbidden", 403);

    const { data: rows, error: aErr } = await admin
      .from("parking_availability")
      .select("weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (aErr) return jsonErr("DB error", 500, aErr.message);

    return jsonOk({ ok: true, parkingId, slots: rows ?? [] }, 200);
  } catch (e: unknown) {
    return jsonErr("Server error", 500, e instanceof Error ? e.message : "Unknown error");
  }
}

// POST /api/owner/availability  body: { parkingId, slots: SlotIn[] }
export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return jsonErr("Unauthorized", 401, "Missing Authorization: Bearer <token>");

    const body = (await req.json().catch(() => ({}))) as { parkingId?: string; slots?: SlotIn[] };
    const parkingId = (body.parkingId ?? "").trim();
    const slots = Array.isArray(body.slots) ? body.slots : [];

    if (!parkingId) return jsonErr("parkingId manquant", 400);

    // user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return jsonErr("Unauthorized", 401, uErr?.message ?? "No user");

    // admin (service role)
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // owner check
    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,owner_id")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return jsonErr("DB error", 500, pErr.message);
    if (!p) return jsonErr("Parking introuvable", 404);
    if (p.owner_id !== u.user.id) return jsonErr("Forbidden", 403);

    // validate slots
    for (const s of slots) {
      if (typeof s.weekday !== "number" || s.weekday < 1 || s.weekday > 7) {
        return jsonErr("weekday invalide (1..7)", 400);
      }
      if (!isTimeLike(s.start_time) || !isTimeLike(s.end_time)) {
        return jsonErr("Heures invalides (format HH:mm ou HH:mm:ss)", 400);
      }
      const a = timeToMinutes(s.start_time);
      const b = timeToMinutes(s.end_time);
      if (!(b > a)) return jsonErr("end_time doit être après start_time", 400);
      if (typeof s.enabled !== "boolean") return jsonErr("enabled invalide", 400);
    }

    // Replace strategy: delete then insert (simple, robuste)
    const { error: delErr } = await admin.from("parking_availability").delete().eq("parking_id", parkingId);
    if (delErr) return jsonErr("DB error", 500, delErr.message);

    if (slots.length > 0) {
      const payload = slots.map((s) => ({
        parking_id: parkingId,
        weekday: s.weekday,
        start_time: normalizeTime(s.start_time),
        end_time: normalizeTime(s.end_time),
        enabled: s.enabled,
      }));

      const { error: insErr } = await admin.from("parking_availability").insert(payload);
      if (insErr) return jsonErr("DB error", 500, insErr.message);
    }

    return jsonOk({ ok: true, parkingId, saved: true, count: slots.length }, 200);
  } catch (e: unknown) {
    return jsonErr("Server error", 500, e instanceof Error ? e.message : "Unknown error");
  }
}
