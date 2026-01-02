import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const secret = env("CLEANUP_SECRET");
    const got = req.headers.get("x-cleanup-secret") ?? "";
    if (got !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const minutes = 20;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "expired", payment_status: "unpaid" })
      .eq("status", "pending_payment")
      .eq("payment_status", "unpaid")
      .lt("created_at", cutoff)
      .select("id");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, expired: (data ?? []).length, cutoff });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
