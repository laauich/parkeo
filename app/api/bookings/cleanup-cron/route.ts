import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bookings/cleanup-cron
 * Sécurisé par header: x-cleanup-secret
 */
export async function GET(req: Request) {
  try {
    const cleanupSecret = process.env.CLEANUP_SECRET;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // 🔐 Vérifications ENV
    if (!cleanupSecret || !serviceKey || !supabaseUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "ENV manquante",
          hasCleanupSecret: !!cleanupSecret,
          hasServiceKey: !!serviceKey,
          hasSupabaseUrl: !!supabaseUrl,
        },
        { status: 500 }
      );
    }

    // 🔐 Sécurité : header secret
    const headerSecret = req.headers.get("x-cleanup-secret");
    if (headerSecret !== cleanupSecret) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // ⏱️ seuil : réservations non payées depuis +15 min
    const expiredBefore = new Date(
      Date.now() - 15 * 60 * 1000
    ).toISOString();

    // 🔍 bookings à nettoyer
    const { data: bookings, error: fetchError } = await supabase
      .from("bookings")
      .select("id")
      .eq("payment_status", "unpaid")
      .eq("status", "pending_payment")
      .lt("created_at", expiredBefore);

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      );
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({
        ok: true,
        cleaned: 0,
        message: "Aucune réservation à nettoyer",
      });
    }

    const ids = bookings.map((b) => b.id);

    // 🧹 Suppression
    const { error: deleteError } = await supabase
      .from("bookings")
      .delete()
      .in("id", ids);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      cleaned: ids.length,
      ids,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
