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

type SlotInput = {
  weekday: number; // 1..7
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  enabled: boolean;
};

type Body = {
  parkingId?: string;
  slots?: SlotInput[];
};

function isTimeHHMM(v: unknown): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

function normalizeSlot(x: SlotInput): SlotInput | null {
  if (!Number.isFinite(x.weekday) || x.weekday < 1 || x.weekday > 7) return null;
  if (!isTimeHHMM(x.start_time) || !isTimeHHMM(x.end_time)) return null;
  if (typeof x.enabled !== "boolean") return null;

  // check end > start (simple compare HH:MM)
  if (x.end_time <= x.start_time) return null;

  return {
    weekday: x.weekday,
    start_time: x.start_time,
    end_time: x.end_time,
    enabled: x.enabled,
  };
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

    const body = (await req.json().catch(() => ({}))) as Body;
    const parkingId = (body.parkingId ?? "").trim();
    const slotsIn = Array.isArray(body.slots) ? body.slots : [];

    if (!parkingId) {
      return NextResponse.json({ ok: false, error: "parkingId manquant" }, { status: 400 });
    }

    const slots: SlotInput[] = [];
    for (const s of slotsIn) {
      const n = normalizeSlot(s);
      if (!n) {
        return NextResponse.json({ ok: false, error: "Slot invalide" }, { status: 400 });
      }
      slots.push(n);
    }

    // 1) user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized", detail: uErr?.message }, { status: 401 });
    }

    // 2) admin
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 3) ownership check
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

    // 4) Replace-all strategy
    const { error: delErr } = await admin.from("parking_availability").delete().eq("parking_id", parkingId);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

    if (slots.length > 0) {
      const insertPayload = slots.map((s) => ({
        parking_id: parkingId,
        weekday: s.weekday,
        start_time: s.start_time,
        end_time: s.end_time,
        enabled: s.enabled,
      }));

      const { error: insErr } = await admin.from("parking_availability").insert(insertPayload);
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
