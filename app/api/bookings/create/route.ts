// app/api/bookings/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import BookingOwnerEmail from "@/app/emails/BookingOwnerEmail";
import BookingClientEmail from "@/app/emails/BookingClientEmail";
import { resend, getFromEmail, getAppUrl } from "@/app/lib/resend";

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

type Body = {
  parkingId?: string;
  startTime?: string;
  endTime?: string;
  totalPrice?: number;
  currency?: string;
};

function safeIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;

    const parkingId = (body.parkingId ?? "").trim();
    const startTime = safeIso(body.startTime);
    const endTime = safeIso(body.endTime);
    const totalPrice = typeof body.totalPrice === "number" ? body.totalPrice : null;
    const currency = typeof body.currency === "string" ? body.currency : "CHF";

    if (!parkingId) return NextResponse.json({ ok: false, error: "parkingId manquant" }, { status: 400 });
    if (!startTime || !endTime) return NextResponse.json({ ok: false, error: "Dates invalides" }, { status: 400 });
    if (Date.parse(endTime) <= Date.parse(startTime))
      return NextResponse.json({ ok: false, error: "endTime doit être après startTime" }, { status: 400 });

    // Auth user via anon + bearer
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const clientId = u.user.id;

    // Admin client (service role)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Get parking + owner
    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,title,owner_id")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ ok: false, error: "Parking introuvable" }, { status: 404 });

    const ownerId = (p as { owner_id: string }).owner_id;
    const parkingTitle = (p as { title: string | null }).title ?? "Place";

    // Insert booking
    const { data: b, error: bErr } = await admin
      .from("bookings")
      .insert({
        parking_id: parkingId,
        user_id: clientId,
        start_time: startTime,
        end_time: endTime,
        total_price: totalPrice,
        currency,
        status: "pending",
        payment_status: "unpaid",
      })
      .select("id,parking_id,user_id,start_time,end_time,total_price,currency")
      .maybeSingle();

    if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
    if (!b) return NextResponse.json({ ok: false, error: "Insert booking failed" }, { status: 500 });

    // Fetch emails (owner + client)
    const [ownerRes, clientRes] = await Promise.all([
      admin.auth.admin.getUserById(ownerId),
      admin.auth.admin.getUserById(clientId),
    ]);

    const ownerEmail = ownerRes.data?.user?.email ?? null;
    const clientEmail = clientRes.data?.user?.email ?? null;

    const appUrl = getAppUrl();
    const from = getFromEmail();

    // Send emails (best effort — si email absent, on skip)
    const emailJobs: Array<Promise<unknown>> = [];

    if (ownerEmail) {
      emailJobs.push(
        resend.emails.send({
          from,
          to: [ownerEmail],
          subject: `Nouvelle réservation — ${parkingTitle}`,
          react: BookingOwnerEmail({
            ownerEmail,
            parkingTitle,
            startTime: new Date(b.start_time as string).toLocaleString("fr-CH"),
            endTime: new Date(b.end_time as string).toLocaleString("fr-CH"),
            totalPrice: (b.total_price as number | null) ?? null,
            currency: (b.currency as string | null) ?? "CHF",
            bookingId: b.id as string,
            appUrl,
          }),
        })
      );
    }

    if (clientEmail) {
      emailJobs.push(
        resend.emails.send({
          from,
          to: [clientEmail],
          subject: `Confirmation réservation — ${parkingTitle}`,
          react: BookingClientEmail({
            clientEmail,
            parkingTitle,
            startTime: new Date(b.start_time as string).toLocaleString("fr-CH"),
            endTime: new Date(b.end_time as string).toLocaleString("fr-CH"),
            totalPrice: (b.total_price as number | null) ?? null,
            currency: (b.currency as string | null) ?? "CHF",
            bookingId: b.id as string,
            appUrl,
          }),
        })
      );
    }

    // Fire-and-forget (mais on attend quand même pour voir les erreurs en dev)
    await Promise.allSettled(emailJobs);

    return NextResponse.json({ ok: true, bookingId: b.id, booking: b }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
