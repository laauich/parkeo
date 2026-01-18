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

type ApiOk = { ok: true; unseen: number };
type ApiErr = { ok: false; error: string; detail?: string };

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, { status: 401 });
    }

    // user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: uErr?.message } satisfies ApiErr,
        { status: 401 }
      );
    }

    const ownerId = u.user.id;

    const url = new URL(req.url);
    const since = (url.searchParams.get("since") || "").trim(); // ISO date

    // service role
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // bookings des places owner
    // ✅ on filtre sur created_at > since si since fourni
    let q = admin
      .from("bookings")
      .select("id, created_at, parkings:parking_id!inner(owner_id)", { count: "exact", head: true })
      .eq("parkings.owner_id", ownerId);

    if (since) {
      q = q.gt("created_at", since);
    }

    const { count, error } = await q;

    if (error) {
      return NextResponse.json(
        { ok: false, error: "DB error", detail: error.message } satisfies ApiErr,
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, unseen: count ?? 0 } satisfies ApiOk, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
