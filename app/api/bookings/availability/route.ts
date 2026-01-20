import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

const TZ = "Europe/Zurich";

type AvailabilityRow = {
  weekday: number; // 1..7
  start_time: string; // "HH:MM:SS" ou "HH:MM"
  end_time: string;
  enabled: boolean;
};

function parseTimeToMinutes(t: string) {
  const s = String(t ?? "").trim();
  const [hh, mm] = s.split(":");
  const h = Number(hh ?? "0");
  const m = Number(mm ?? "0");
  return h * 60 + m;
}

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

function isWithinOneSlot(
  weekday: number,
  startMin: number,
  endMin: number,
  slots: AvailabilityRow[]
) {
  const daySlots = slots
    .filter((s) => s.enabled && s.weekday === weekday)
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
 * (Même logique que côté create booking)
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

  let cursor = new Date(start.getTime());
  let guard = 0;

  while (cursor.getTime() < end.getTime()) {
    if (++guard > 40) return false; // sécurité

    const cursorParts = getLocalParts(cursor);
    const cursorYmd = cursorParts.ymd;

    // trouver le début du lendemain local (approche robuste sans lib TZ)
    let nextDay = new Date(cursor.getTime());
    for (let i = 0; i < 30; i++) {
      nextDay = new Date(nextDay.getTime() + 60 * 60 * 1000);
      if (getLocalParts(nextDay).ymd !== cursorYmd) break;
    }

    const segStart = cursor.getTime() < start.getTime() ? start : cursor;
    const segEnd = nextDay.getTime() > end.getTime() ? end : nextDay;

    const segStartParts = getLocalParts(segStart);
    const segEndParts = getLocalParts(segEnd);

    const weekday = segStartParts.weekday;
    if (weekday < 1 || weekday > 7) return false;

    const segStartMin = segStartParts.minutes;

    let segEndMin = segEndParts.minutes;
    const segEndYmd = segEndParts.ymd;

    // si segEnd tombe à 00:00 du lendemain local → endMin = 24:00 du jour précédent
    if (segEndYmd !== segStartParts.ymd && segEndMin === 0) {
      segEndMin = 24 * 60;
    }

    if (!(segEnd.getTime() > segStart.getTime())) return false;
    if (segEndMin <= segStartMin) return false;

    const ok = isWithinOneSlot(weekday, segStartMin, segEndMin, slots);
    if (!ok) return false;

    cursor = new Date(segEnd.getTime());
  }

  return true;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const { searchParams } = new URL(req.url);

    const parkingId = (searchParams.get("parkingId") ?? "").trim();
    const startRaw = searchParams.get("start") ?? "";
    const endRaw = searchParams.get("end") ?? "";

    if (!parkingId || !startRaw || !endRaw) {
      return NextResponse.json(
        { available: false, reason: "Paramètres manquants", code: "MISSING_PARAMS" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const start = new Date(startRaw);
    const end = new Date(endRaw);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json(
        { available: false, reason: "Format de date invalide", code: "INVALID_DATE" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (end <= start) {
      return NextResponse.json(
        { available: false, reason: "La fin doit être après le début", code: "INVALID_RANGE" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // 0) Parking OFF ?
    const { data: p, error: pErr } = await supabaseAdmin
      .from("parkings")
      .select("id,is_active")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json(
        { available: false, reason: pErr.message, code: "DB_ERROR" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!p) {
      return NextResponse.json(
        { available: false, reason: "Parking introuvable", code: "NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    if ((p as { is_active?: boolean | null }).is_active === false) {
      return NextResponse.json(
        { available: false, reason: "Place désactivée", code: "PARKING_OFF" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1) Overlap booking existant (bloquant)
    const { data: overlaps, error: ovErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("parking_id", parkingId)
      .neq("status", "cancelled")
      .lt("start_time", endISO)
      .gt("end_time", startISO)
      .limit(1);

    if (ovErr) {
      return NextResponse.json(
        { available: false, reason: ovErr.message, code: "DB_ERROR" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if ((overlaps ?? []).length > 0) {
      return NextResponse.json(
        { available: false, reason: "Déjà réservé sur ce créneau", code: "BOOKING_OVERLAP" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) Blackouts
    const { data: blackouts, error: boErr } = await supabaseAdmin
      .from("parking_blackouts")
      .select("id,start_at,end_at")
      .eq("parking_id", parkingId)
      .lt("start_at", endISO)
      .gt("end_at", startISO)
      .limit(1);

    if (boErr) {
      return NextResponse.json(
        { available: false, reason: boErr.message, code: "DB_ERROR" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if ((blackouts ?? []).length > 0) {
      return NextResponse.json(
        { available: false, reason: "Indisponible (blackout)", code: "BLACKOUT" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 3) Planning hebdo (fallback legacy si pas de créneau actif)
    const { data: slots, error: slErr } = await supabaseAdmin
      .from("parking_availability")
      .select("weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingId);

    if (slErr) {
      return NextResponse.json(
        { available: false, reason: slErr.message, code: "DB_ERROR" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const slotRows = ((slots ?? []) as AvailabilityRow[]).filter(
      (s) => s && typeof s.weekday === "number"
    );

    const hasAnyPlanning = slotRows.some((s) => !!s.enabled);

    // ✅ fallback legacy : pas de planning actif => dispo (si pas de booking/blackout)
    if (!hasAnyPlanning) {
      return NextResponse.json(
        { available: true },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const covered = isBookingCoveredByAvailability(startISO, endISO, slotRows);
    if (!covered) {
      return NextResponse.json(
        { available: false, reason: "Hors horaires du propriétaire", code: "OUTSIDE_AVAILABILITY" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { available: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { available: false, reason: e instanceof Error ? e.message : "Server error", code: "SERVER_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
