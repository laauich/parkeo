// app/api/bookings/availability/route.ts
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
  const [hh, mm] = String(t ?? "").split(":");
  const h = Number(hh ?? "0");
  const m = Number(mm ?? "0");
  return h * 60 + m;
}

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

  const wd = get("weekday");
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
    .filter((s) => s.weekday === weekday && !!s.enabled)
    .map((s) => ({
      start: parseTimeToMinutes(s.start_time),
      end: parseTimeToMinutes(s.end_time),
    }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);

  // ✅ FIX MULTI-JOURS (seulement ça) :
  // Si le segment finit à 24:00 (1440) et que le slot finit à 23:59 (1439),
  // on considère que ça couvre la journée entière (usage classique pour "24/24").
  return daySlots.some((s) => {
    const coversEnd =
      s.end >= endMin || (endMin === 24 * 60 && s.end === 24 * 60 - 1);
    return s.start <= startMin && coversEnd;
  });
}

/**
 * Vérifie si l'intervalle [start,end] est couvert par des slots enabled,
 * en découpant en segments par jour local (Europe/Zurich).
 */
function isBookingCoveredByAvailability(startISO: string, endISO: string, slots: AvailabilityRow[]) {
  const start = new Date(startISO);
  const end = new Date(endISO);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end.getTime() <= start.getTime()) return false;

  let cursor = new Date(start.getTime());
  let guard = 0;

  while (cursor.getTime() < end.getTime()) {
    if (++guard > 40) return false; // safety

    const cursorParts = getLocalParts(cursor);
    const cursorYmd = cursorParts.ymd;

    // trouver le prochain jour local en avançant par tranches d'1h (max 30h)
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

    // si segEnd tombe pile à 00:00 du lendemain local => endMin=24:00 pour le jour précédent
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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // 0) parking OFF global ?
    const { data: p, error: pErr } = await admin
      .from("parkings")
      .select("id,is_active")
      .eq("id", parkingId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ available: false, reason: "Parking introuvable" }, { status: 200 });
    if ((p as { is_active?: boolean | null }).is_active === false) {
      return NextResponse.json(
        { available: false, reason: "Place désactivée par le propriétaire" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1) blackouts
    const { data: blackouts, error: boErr } = await admin
      .from("parking_blackouts")
      .select("id,start_at,end_at")
      .eq("parking_id", parkingId)
      .lt("start_at", endISO)
      .gt("end_at", startISO)
      .limit(1);

    if (boErr) return NextResponse.json({ error: boErr.message }, { status: 500 });

    if ((blackouts ?? []).length > 0) {
      return NextResponse.json(
        { available: false, reason: "Fermé / blackout du propriétaire" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) planning hebdo
    const { data: slots, error: slErr } = await admin
      .from("parking_availability")
      .select("weekday,start_time,end_time,enabled")
      .eq("parking_id", parkingId);

    if (slErr) return NextResponse.json({ error: slErr.message }, { status: 500 });

    const slotRows = ((slots ?? []) as AvailabilityRow[]).filter(
      (s) => s && typeof s.weekday === "number"
    );

    // ✅ DECISION (ma décision):
    // - si des lignes existent => planning "configuré" et donc obligatoire (même si tout OFF)
    // - sinon fallback legacy: ouvert
    const planningConfigured = slotRows.length > 0;

    if (planningConfigured) {
      const anyEnabled = slotRows.some((s) => !!s.enabled);

      // tout OFF => fermé
      if (!anyEnabled) {
        return NextResponse.json(
          { available: false, reason: "Fermé / hors horaires du propriétaire" },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        );
      }

      const covered = isBookingCoveredByAvailability(startISO, endISO, slotRows);
      if (!covered) {
        return NextResponse.json(
          { available: false, reason: "Fermé / hors horaires du propriétaire" },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // 3) overlap bookings (bloquants)
    const { data: overlaps, error: ovErr } = await admin
      .from("bookings")
      .select("id,status")
      .eq("parking_id", parkingId)
      .neq("status", "cancelled")
      .lt("start_time", endISO) // existing.start < new.end
      .gt("end_time", startISO) // existing.end > new.start
      .limit(1);

    if (ovErr) return NextResponse.json({ error: ovErr.message }, { status: 500 });

    if ((overlaps ?? []).length > 0) {
      return NextResponse.json(
        { available: false, reason: "Déjà réservé sur ce créneau" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { available: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
