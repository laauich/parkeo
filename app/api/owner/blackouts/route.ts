// app/api/owner/blackouts/route.ts
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

function safeIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

type BlackoutRow = {
  id: string;
  parking_id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_at: string | null;
};

type PostBody = {
  parkingId?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
};

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const parkingId = (searchParams.get("parkingId") ?? "").trim();
    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" }, { status: 400 });

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("parking_blackouts")
      .select("id,parking_id,start_time,end_time,reason,created_at")
      .eq("parking_id", parkingId)
      .order("start_time", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, rows: (data ?? []) as BlackoutRow[] }, { status: 200 });
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
    const startTime = safeIso(body.startTime);
    const endTime = safeIso(body.endTime);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 140) : null;

    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" }, { status: 400 });
    if (!startTime || !endTime) return NextResponse.json({ ok: false, error: "Dates invalides" }, { status: 400 });
    if (Date.parse(endTime) <= Date.parse(startTime)) {
      return NextResponse.json({ ok: false, error: "endTime doit être après startTime" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("parking_blackouts")
      .insert({
        parking_id: parkingId,
        start_time: startTime,
        end_time: endTime,
        reason: reason || null,
      })
      .select("id,parking_id,start_time,end_time,reason,created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, blackout: data }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "id manquant" }, { status: 400 });

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { error } = await supabase.from("parking_blackouts").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
