// app/api/owner/bookings/route.ts
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

type ApiOk = {
  ok: true;
  parkings: Array<{ id: string; title: string }>;
  bookings: Array<{
    id: string;
    parking_id: string;
    user_id: string;
    start_time: string;
    end_time: string;
    total_price: number | null;
    status: string | null;
    payment_status: string | null;
    created_at: string | null;

    parking_title: string | null;
    user_email: string | null;
  }>;
};

type ApiErr = { ok: false; error: string; detail?: string };

function jsonOk(payload: ApiOk, status = 200) {
  return NextResponse.json(payload, { status });
}

function jsonErr(error: string, status = 400, detail?: string) {
  const payload: ApiErr = { ok: false, error, ...(detail ? { detail } : {}) };
  return NextResponse.json(payload, { status });
}

type BookingBaseRow = {
  id: string;
  parking_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  total_price: number | null;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;
};

type ParkingOwnerRow = { id: string; title: string; owner_id: string };
type ParkingLiteRow = { id: string; title: string };
type AuthUserRow = { id: string; email: string | null };

type DbError = { message: string };

// ✅ Query builder minimal (sans any) + awaitable
type QueryLike<T> = {
  select: (columns: string) => QueryLike<T>;
  eq: (column: string, value: string) => QueryLike<T>;
  in: (column: string, values: string[]) => QueryLike<T>;
  order: (column: string, opts?: { ascending?: boolean }) => QueryLike<T>;
  maybeSingle: () => Promise<{ data: T | null; error: DbError | null }>;

  // Permet: const {data, error} = await admin.from<T>(...).select(...)
  then: Promise<{ data: T[] | null; error: DbError | null }>["then"];
};

type AdminLike = {
  // On évite SupabaseClient<...> (conflits génériques) et on ne met pas de any
  from: <T = unknown>(table: string) => QueryLike<T>;
};

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
      return jsonErr("Unauthorized", 401, "Missing Authorization: Bearer <token>");
    }

    const url = new URL(req.url);
    const parkingId = (url.searchParams.get("parkingId") || "").trim() || null;

    // 1) user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return jsonErr("Unauthorized", 401, uErr?.message ?? "No user");
    }

    // 2) admin client (service role)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    }) as unknown as AdminLike;

    // ----- parkingId fourni : check owner explicite -----
    if (parkingId) {
      const { data: one, error: oneErr } = await admin
        .from<ParkingOwnerRow>("parkings")
        .select("id,title,owner_id")
        .eq("id", parkingId)
        .maybeSingle();

      if (oneErr) return jsonErr("DB error", 500, oneErr.message);
      if (!one) return jsonErr("Parking not found", 404);
      if (one.owner_id !== u.user.id) return jsonErr("Forbidden", 403);

      const { data: bookings, error: bErr } = await admin
        .from<BookingBaseRow>("bookings")
        .select(
          "id,parking_id,user_id,start_time,end_time,total_price,status,payment_status,created_at"
        )
        .eq("parking_id", parkingId)
        .order("start_time", { ascending: false });

      if (bErr) return jsonErr("DB error", 500, bErr.message);

      const enriched = await enrichWithEmails({
        admin,
        bookings: (bookings ?? []) as BookingBaseRow[],
        parkingTitleById: { [one.id]: one.title },
      });

      return jsonOk(
        {
          ok: true,
          parkings: [{ id: one.id, title: one.title }],
          bookings: enriched,
        },
        200
      );
    }

    // ----- parkingId absent : toutes les places du owner -----
    const { data: myParkings, error: pErr } = await admin
      .from<ParkingLiteRow>("parkings")
      .select("id,title")
      .eq("owner_id", u.user.id)
      .order("created_at", { ascending: false });

    if (pErr) return jsonErr("DB error", 500, pErr.message);

    const parkings = (myParkings ?? []) as Array<{ id: string; title: string }>;
    const ids = parkings.map((p) => p.id);

    if (ids.length === 0) {
      return jsonOk({ ok: true, parkings: [], bookings: [] }, 200);
    }

    const { data: bookings, error: bErr } = await admin
      .from<BookingBaseRow>("bookings")
      .select(
        "id,parking_id,user_id,start_time,end_time,total_price,status,payment_status,created_at"
      )
      .in("parking_id", ids)
      .order("start_time", { ascending: false });

    if (bErr) return jsonErr("DB error", 500, bErr.message);

    const parkingTitleById = Object.fromEntries(parkings.map((p) => [p.id, p.title])) as Record<
      string,
      string
    >;

    const enriched = await enrichWithEmails({
      admin,
      bookings: (bookings ?? []) as BookingBaseRow[],
      parkingTitleById,
    });

    return jsonOk({ ok: true, parkings, bookings: enriched }, 200);
  } catch (e: unknown) {
    return jsonErr("Server error", 500, e instanceof Error ? e.message : "Unknown error");
  }
}

/**
 * Best-effort: ajoute parking_title + user_email.
 * - user_email: via auth.users (service role). Si inaccessible, on met null.
 */
async function enrichWithEmails(args: {
  admin: AdminLike;
  bookings: BookingBaseRow[];
  parkingTitleById: Record<string, string>;
}) {
  const { admin, bookings, parkingTitleById } = args;

  const userIds = Array.from(new Set(bookings.map((b) => b.user_id).filter(Boolean))) as string[];

  let usersById: Record<string, { email: string | null }> = {};

  if (userIds.length > 0) {
    try {
      // ✅ pas de any : on cible directement "auth.users" (service role)
      const { data: users, error: uErr } = await admin
        .from<AuthUserRow>("auth.users")
        .select("id,email")
        .in("id", userIds);

      if (!uErr && Array.isArray(users)) {
        usersById = Object.fromEntries(users.map((x) => [x.id, { email: x.email }]));
      }
    } catch {
      // ignore: best-effort
    }
  }

  return bookings.map((b) => ({
    ...b,
    parking_title: parkingTitleById[b.parking_id] ?? null,
    user_email: usersById[b.user_id]?.email ?? null,
  }));
}
