import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const { searchParams } = new URL(req.url);

    const parkingId = searchParams.get("parkingId") ?? "";
    const startRaw = searchParams.get("start") ?? "";
    const endRaw = searchParams.get("end") ?? "";

    if (!parkingId || !startRaw || !endRaw) {
      return NextResponse.json(
        { error: "Missing query params", expected: ["parkingId", "start", "end"] },
        { status: 400 }
      );
    }

    const start = new Date(startRaw);
    const end = new Date(endRaw);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "end must be after start" }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // même logique que la contrainte: si un booking "bloquant" overlap, c'est indispo
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("parking_id", parkingId)
      .in("status", ["pending_payment", "confirmed", "pending"])
      .lt("start_time", end.toISOString()) // existing.start < new.end
      .gt("end_time", start.toISOString()) // existing.end > new.start
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const available = !(data && data.length > 0);

    return NextResponse.json(
      { available },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
