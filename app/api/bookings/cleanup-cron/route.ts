import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v : "";
}

export async function GET() {
  // GET = ping (pour debug)
  return NextResponse.json(
    {
      ok: true,
      route: "/api/bookings/cleanup-cron",
      method: "GET",
      hasCleanupSecret: !!env("CLEANUP_SECRET"),
      hasServiceKey: !!env("SUPABASE_SERVICE_ROLE_KEY"),
      hasSupabaseUrl: !!env("NEXT_PUBLIC_SUPABASE_URL"),
    },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const secret = env("CLEANUP_SECRET");
    const got = req.headers.get("x-cleanup-secret") ?? "";

    if (!secret) {
      return NextResponse.json(
        { ok: false, where: "env", error: "CLEANUP_SECRET manquant" },
        { status: 500 }
      );
    }

    if (got !== secret) {
      return NextResponse.json(
        { ok: false, where: "auth", error: "Unauthorized (secret)" },
        { status: 401 }
      );
    }

    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl) {
      return NextResponse.json(
        { ok: false, where: "env", error: "NEXT_PUBLIC_SUPABASE_URL manquante" },
        { status: 500 }
      );
    }
    if (!serviceKey) {
      return NextResponse.json(
        { ok: false, where: "env", error: "SUPABASE_SERVICE_ROLE_KEY manquante" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // delete pending_payment + unpaid older than 20 minutes
    const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .delete()
      .eq("status", "pending_payment")
      .eq("payment_status", "unpaid")
      .lt("created_at", cutoff)
      .select("id");

    if (error) {
      return NextResponse.json(
        { ok: false, where: "supabase", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, deletedCount: (data ?? []).length, deletedIds: (data ?? []).map((r) => r.id) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, where: "exception", error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
