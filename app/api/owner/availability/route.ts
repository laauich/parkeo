// app/api/owner/availability/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

type DayKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Slot = {
  weekday: DayKey;
  enabled: boolean;
  start_time: string; // "HH:MM" ou "HH:MM:SS"
  end_time: string;
};

type GetOk = { ok: true; slots: Slot[] };
type GetErr = { ok: false; error: string; detail?: string };

type PostBody = {
  parkingId?: string;
  slots?: Slot[];
};

function isDayKey(n: number): n is DayKey {
  return n >= 1 && n <= 7;
}

function clampTime(t: string): string {
  const s = t.trim();
  if (!s) return "00:00";
  const parts = s.split(":");
  const hh = Number(parts[0] ?? "0");
  const mm = Number(parts[1] ?? "0");
  const H = Number.isFinite(hh) ? Math.min(23, Math.max(0, hh)) : 0;
  const M = Number.isFinite(mm) ? Math.min(59, Math.max(0, mm)) : 0;
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies GetErr, { status: 401 });

    const url = new URL(req.url);
    const parkingId = (url.searchParams.get("parkingId") ?? "").trim();
    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" } satisfies GetErr, { status: 400 });

    // user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies GetErr, { status: 401 });

    const userId = u.user.id;

    // admin
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,owner_id")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message } satisfies GetErr, { status: 500 });
    if (!p) return NextResponse.json({ ok: false, error: "Parking introuvable" } satisfies GetErr, { status: 404 });
    if ((p as { owner_id: string }).owner_id !== userId)
      return NextResponse.json({ ok: false, error: "Forbidden" } satisfies GetErr, { status: 403 });

    const { data: rows, error } = await admin
      .from("parking_availability")
      .select("weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingId)
      .order("weekday", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message } satisfies GetErr, { status: 500 });

    const slots: Slot[] = (rows ?? [])
      .map((r) => {
        const wd = Number((r as { weekday: number }).weekday);
        if (!Number.isFinite(wd) || !isDayKey(wd)) return null;

        return {
          weekday: wd,
          enabled: Boolean((r as { enabled: boolean }).enabled),
          start_time: String((r as { start_time: string }).start_time ?? "08:00"),
          end_time: String((r as { end_time: string }).end_time ?? "20:00"),
        } satisfies Slot;
      })
      .filter((x): x is Slot => x !== null)
      .map((s) => ({ ...s, start_time: clampTime(s.start_time), end_time: clampTime(s.end_time) }));

    return NextResponse.json({ ok: true, slots } satisfies GetOk, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" } satisfies GetErr,
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" } as const, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as PostBody;

    const parkingId = (body.parkingId ?? "").trim();
    const slotsIn = Array.isArray(body.slots) ? body.slots : [];

    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" } as const, { status: 400 });

    // user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" } as const, { status: 401 });

    const userId = u.user.id;

    // admin
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,owner_id")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message } as const, { status: 500 });
    if (!p) return NextResponse.json({ ok: false, error: "Parking introuvable" } as const, { status: 404 });
    if ((p as { owner_id: string }).owner_id !== userId)
      return NextResponse.json({ ok: false, error: "Forbidden" } as const, { status: 403 });

    // Normalise + sécurité weekday
    const normalized: Slot[] = slotsIn
      .map((s) => {
        const wd = Number((s as { weekday: number }).weekday);
        if (!Number.isFinite(wd) || !isDayKey(wd)) return null;

        return {
          weekday: wd,
          enabled: Boolean((s as { enabled: boolean }).enabled),
          start_time: clampTime(String((s as { start_time?: string }).start_time ?? "08:00")),
          end_time: clampTime(String((s as { end_time?: string }).end_time ?? "20:00")),
        } satisfies Slot;
      })
      .filter((x): x is Slot => x !== null);

    // delete then upsert
    const { error: delErr } = await admin.from("parking_availability").delete().eq("parking_id", parkingId);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message } as const, { status: 500 });

    if (normalized.length > 0) {
      const rows = normalized.map((s) => ({
        parking_id: parkingId,
        weekday: s.weekday,
        start_time: s.start_time,
        end_time: s.end_time,
        enabled: s.enabled,
      }));

      const { error: insErr } = await admin.from("parking_availability").insert(rows);
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message } as const, { status: 500 });
    }

    return NextResponse.json({ ok: true } as const, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" } as const,
      { status: 500 }
    );
  }
}
