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

const TZ = "Europe/Zurich";

/**
 * Convertit une date en "parties" locale Suisse:
 * - weekday: 1=lundi ... 7=dimanche
 * - minutes: minutes depuis 00:00 locale
 * - ymd: YYYY-MM-DD locale
 */
function getLocalParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const wd = get("weekday"); // Mon, Tue, ...
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  const weekday = weekdayMap[wd] ?? 0;

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const ymd = `${year}-${month}-${day}`;

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const minutes = hour * 60 + minute;

  return { weekday, minutes, ymd };
}

function parseTimeToMinutes(t: string) {
  // formats possibles: "HH:MM:SS" ou "HH:MM"
  const [hh, mm] = t.split(":");
  const h = Number(hh ?? "0");
  const m = Number(mm ?? "0");
  return h * 60 + m;
}

type AvailabilityRow = {
  weekday: number; // 1..7
  start_time: string; // time
  end_time: string; // time
  enabled: boolean;
};

function isEnabledAvailability(a: AvailabilityRow) {
  return !!a.enabled;
}

function isWithinOneSlot(
  weekday: number,
  startMin: number,
  endMin: number,
  slots: AvailabilityRow[]
) {
  const daySlots = slots
    .filter((s) => isEnabledAvailability(s) && s.weekday === weekday)
    .map((s) => ({
      start: parseTimeToMinutes(s.start_time),
      end: parseTimeToMinutes(s.end_time),
    }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);

  // il faut qu'un slot englobe complètement le segment [startMin, endMin]
  return daySlots.some((s) => s.start <= startMin && s.end >= endMin);
}

/**
 * Découpe la réservation en segments par jour local (Suisse),
 * et vérifie que chaque segment est couvert par un slot de disponibilité.
 */
function isBookingCoveredByAvailability(
  startISO: string,
  endISO: string,
  slots: AvailabilityRow[]
) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end.getTime() <= start.getTime()) return false;

  // boucle jour par jour en se basant sur le "ymd" local
  let cursor = new Date(start.getTime());

  // sécurité anti boucle infinie
  let guard = 0;

  while (cursor.getTime() < end.getTime()) {
    if (++guard > 40) return false; // bookings > 40 jours -> on refuse par sécurité

    const cursorParts = getLocalParts(cursor);
    const cursorYmd = cursorParts.ymd;

    // trouver le début du lendemain (local) en construisant "YYYY-MM-DDT00:00:00" local
    // Sans librairie TZ, on fait une approche robuste:
    // - on avance en UTC par tranches d'1h jusqu'à changement de ymd local (max 30h)
    let nextDay = new Date(cursor.getTime());
    for (let i = 0; i < 30; i++) {
      nextDay = new Date(nextDay.getTime() + 60 * 60 * 1000);
      if (getLocalParts(nextDay).ymd !== cursorYmd) break;
    }

    // segment = [segStart, segEnd] intersecté avec [start,end]
    const segStart = cursor.getTime() < start.getTime() ? start : cursor;
    const segEnd = nextDay.getTime() > end.getTime() ? end : nextDay;

    const segStartParts = getLocalParts(segStart);
    const segEndParts = getLocalParts(segEnd);

    // même jour local attendu
    const weekday = segStartParts.weekday;
    if (weekday < 1 || weekday > 7) return false;

    const segStartMin = segStartParts.minutes;

    // si segEnd tombe exactement à 00:00 du lendemain local, on considère endMin = 24h00 pour le jour précédent
    // (sinon minutes=0 et ça casserait "end > start")
    let segEndMin = segEndParts.minutes;
    const segEndYmd = segEndParts.ymd;

    if (segEndYmd !== segStartParts.ymd && segEndMin === 0) {
      segEndMin = 24 * 60;
    }

    // segment doit avoir une durée positive
    if (!(segEnd.getTime() > segStart.getTime())) return false;
    if (segEndMin <= segStartMin) {
      // cas rare DST / arrondis -> on refuse pour éviter bug
      return false;
    }

    const ok = isWithinOneSlot(weekday, segStartMin, segEndMin, slots);
    if (!ok) return false;

    // avancer cursor au segEnd
    cursor = new Date(segEnd.getTime());
  }

  return true;
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

    // =========================
    // ✅ AVAILABILITY / BLACKOUTS / OVERLAP CHECKS
    // =========================

    const availabilityEnabled =
      (process.env.NEXT_PUBLIC_AVAILABILITY_ENABLED ?? "true").toLowerCase() !== "false";

    // 1) Chevauchement avec booking existant (non annulé)
    // overlap si: start < existing_end AND end > existing_start
    const { data: overlaps, error: ovErr } = await admin
      .from("bookings")
      .select("id,status,start_time,end_time")
      .eq("parking_id", parkingId)
      .neq("status", "cancelled")
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .limit(1);

    if (ovErr) return NextResponse.json({ ok: false, error: ovErr.message }, { status: 500 });

    if ((overlaps ?? []).length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Créneau indisponible",
          detail: "Cette place est déjà réservée sur ce créneau.",
          code: "BOOKING_OVERLAP",
        },
        { status: 409 }
      );
    }

    if (availabilityEnabled) {
      // 2) Blackouts (indisponibilités ponctuelles)
      const { data: blackouts, error: boErr } = await admin
        .from("parking_blackouts")
        .select("id,start_at,end_at")
        .eq("parking_id", parkingId)
        .lt("start_at", endTime)
        .gt("end_at", startTime)
        .limit(1);

      if (boErr) return NextResponse.json({ ok: false, error: boErr.message }, { status: 500 });

      if ((blackouts ?? []).length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Créneau indisponible",
            detail: "Cette place est indisponible sur ce créneau (planning propriétaire).",
            code: "BLACKOUT",
          },
          { status: 409 }
        );
      }

      // 3) Planning hebdo (fallback si aucun slot)
      const { data: slots, error: slErr } = await admin
        .from("parking_availability")
        .select("weekday,start_time,end_time,enabled")
        .eq("parking_id", parkingId);

      if (slErr) return NextResponse.json({ ok: false, error: slErr.message }, { status: 500 });

      const slotRows = ((slots ?? []) as AvailabilityRow[]).filter((s) => s && typeof s.weekday === "number");

      const hasAnyPlanning = slotRows.some((s) => isEnabledAvailability(s));

      // ✅ fallback : pas de planning => on ne bloque pas (comportement legacy)
      if (hasAnyPlanning) {
        const covered = isBookingCoveredByAvailability(startTime, endTime, slotRows);
        if (!covered) {
          return NextResponse.json(
            {
              ok: false,
              error: "Créneau indisponible",
              detail: "La réservation est hors des horaires définis par le propriétaire.",
              code: "OUTSIDE_AVAILABILITY",
            },
            { status: 409 }
          );
        }
      }
    }

    // =========================
    // ✅ INSERT BOOKING
    // =========================

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

    // Send emails (best effort)
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
            startTime: new Date(b.start_time as string).toLocaleString("fr-CH", { timeZone: TZ }),
            endTime: new Date(b.end_time as string).toLocaleString("fr-CH", { timeZone: TZ }),
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
            startTime: new Date(b.start_time as string).toLocaleString("fr-CH", { timeZone: TZ }),
            endTime: new Date(b.end_time as string).toLocaleString("fr-CH", { timeZone: TZ }),
            totalPrice: (b.total_price as number | null) ?? null,
            currency: (b.currency as string | null) ?? "CHF",
            bookingId: b.id as string,
            appUrl,
          }),
        })
      );
    }

    await Promise.allSettled(emailJobs);

    return NextResponse.json({ ok: true, bookingId: b.id, booking: b }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
