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

/**
 * GET /api/owner/bookings?parkingId=<uuid optional>
 * - If parkingId omitted: returns bookings for ALL parkings owned by user
 * - If provided: returns bookings for that parking (must be owned)
 */
export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Missing Authorization: Bearer <token>" },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const parkingId = url.searchParams.get("parkingId") || null;

    // 1) user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json(
        { error: "Unauthorized", detail: uErr?.message ?? "No user" },
        { status: 401 }
      );
    }

    // 2) admin client to read owner parkings + bookings
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // find owner's parkings
    let q = admin.from("parkings").select("id,title").eq("owner_id", u.user.id);
    if (parkingId) q = q.eq("id", parkingId);

    const { data: myParkings, error: pErr } = await q;
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const ids = (myParkings ?? []).map((p) => p.id);
    if (ids.length === 0) {
      return NextResponse.json({ parkings: [], bookings: [] }, { status: 200 });
    }

    // bookings for those parkings
    const { data: bookings, error: bErr } = await admin
      .from("bookings")
      .select("id,parking_id,user_id,start_time,end_time,total_price,status,payment_status,created_at")
      .in("parking_id", ids)
      .order("start_time", { ascending: false });

    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    // Optional: get user emails for display (best effort)
    // We'll fetch unique user_ids and read from auth.users (requires service role).
    const userIds = Array.from(
      new Set((bookings ?? []).map((b) => b.user_id).filter(Boolean))
    ) as string[];

    let usersById: Record<string, { email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: users, error: u2Err } = await admin
        // Supabase has auth.users; accessible with service role
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("auth.users" as any)
        .select("id,email")
        .in("id", userIds);

      if (!u2Err && users) {
        usersById = Object.fromEntries(
          users.map((x: { id: string; email: string | null }) => [
            x.id,
            { email: x.email },
          ])
        );
      }
    }

    const parkingTitleById = Object.fromEntries(
      (myParkings ?? []).map((p) => [p.id, p.title])
    ) as Record<string, string>;

    const enriched = (bookings ?? []).map((b) => ({
      ...b,
      parking_title: parkingTitleById[b.parking_id] ?? null,
      user_email: usersById[b.user_id]?.email ?? null,
    }));

    return NextResponse.json(
      { parkings: myParkings ?? [], bookings: enriched },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
