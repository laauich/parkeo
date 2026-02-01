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

const TZ = "Europe/Zurich";

/** =========================
* ✅ CHANGEMENT MINIMAL ICI
* Objectif: si start/end n'ont pas de timezone (ex "YYYY-MM-DDTHH:MM"),
* on les interprète comme heure locale Europe/Zurich, puis on convertit en ISO UTC.
* Si déjà "Z" ou "+02:00" => inchangé.
========================= */

function getTzParts(d: Date) {
 const fmt = new Intl.DateTimeFormat("en-GB", {
   timeZone: TZ,
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
   hour: "2-digit",
   minute: "2-digit",
   hour12: false,
 });

 const parts = fmt.formatToParts(d);
 const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

 return {
   y: Number(get("year")),
   m: Number(get("month")),
   d: Number(get("day")),
   hh: Number(get("hour")),
   mm: Number(get("minute")),
 };
}

function zonedZurichToUtcIso(y: number, m: number, d: number, hh: number, mm: number) {
 // Guess initial: on suppose que c'est UTC
 let guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));

 // 2 itérations suffisent (DST)
 for (let i = 0; i < 2; i++) {
   const p = getTzParts(guess);
   const desiredLocalAsUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
   const actualLocalAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, 0);
   const delta = desiredLocalAsUtc - actualLocalAsUtc;
   if (delta === 0) break;
   guess = new Date(guess.getTime() + delta);
 }

 return guess.toISOString();
}

function safeIso(s: unknown): string | null {
 if (typeof s !== "string") return null;
 const v = s.trim();
 if (!v) return null;

 // Si la string contient déjà une timezone (Z ou +/-hh:mm), on ne change rien
 const hasTz = /Z$/.test(v) || /[+-]\d{2}:\d{2}$/.test(v) || /[+-]\d{4}$/.test(v);

 // datetime-local typique: "YYYY-MM-DDTHH:MM" (ou avec secondes)
 const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}):(\d{2})(?::(\d{2}))?$/);

 if (!hasTz && m) {
   const y = Number(m[1]);
   const mo = Number(m[2]);
   const d = Number(m[3]);
   const hh = Number(m[4]);
   const mm = Number(m[5]);
   if ([y, mo, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
   return zonedZurichToUtcIso(y, mo, d, hh, mm);
 }

 // Date.parse standard (ISO complet, RFC, etc.)
 const t = Date.parse(v);
 if (Number.isNaN(t)) return null;
 return new Date(t).toISOString();
}

/** =========================
* Le reste du fichier = inchangé
========================= */

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
 const [hh, mm] = String(t ?? "").split(":");
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
* Découpe la réservation en segments par jour local (Suisse),
* et vérifie que chaque segment est couvert par un slot de disponibilité.
*/
function isBookingCoveredByAvailability(startISO: string, endISO: string, slots: AvailabilityRow[]) {
 const start = new Date(startISO);
 const end = new Date(endISO);
 if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
 if (end.getTime() <= start.getTime()) return false;

 let cursor = new Date(start.getTime());
 let guard = 0;

 while (cursor.getTime() < end.getTime()) {
   if (++guard > 40) return false;

   const cursorParts = getLocalParts(cursor);
   const cursorYmd = cursorParts.ymd;

   // avancer par tranches d'1h jusqu'au changement de jour local (max 30h)
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

   // si segEnd tombe à 00:00 du lendemain local, on prend 24:00 pour le jour précédent
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
   if (Date.parse(endTime) <= Date.parse(startTime)) {
     return NextResponse.json({ ok: false, error: "endTime doit être après startTime" }, { status: 400 });
   }

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

   // Get parking + owner + is_active
   const { data: p, error: pErr } = await admin
     .from("parkings")
     .select("id,title,owner_id,is_active")
     .eq("id", parkingId)
     .maybeSingle();

   if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
   if (!p) return NextResponse.json({ ok: false, error: "Parking introuvable" }, { status: 404 });

   // ✅ OFF global: si la place est désactivée, on bloque
   const isActive = (p as { is_active?: boolean | null }).is_active;
   if (isActive === false) {
     return NextResponse.json(
       {
         ok: false,
         error: "Créneau indisponible",
         detail: "Cette place est désactivée par le propriétaire.",
         code: "PARKING_OFF",
       },
       { status: 409 }
     );
   }

   const ownerId = (p as { owner_id: string }).owner_id;
   const parkingTitle = (p as { title: string | null }).title ?? "Place";

   const availabilityEnabled =
     (process.env.NEXT_PUBLIC_AVAILABILITY_ENABLED ?? "true").toLowerCase() !== "false";

   // 1) Overlap bookings (bloquant)
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

     // 3) Planning hebdo
     const { data: slots, error: slErr } = await admin
       .from("parking_availability")
       .select("weekday,start_time,end_time,enabled")
       .eq("parking_id", parkingId);

     if (slErr) return NextResponse.json({ ok: false, error: slErr.message }, { status: 500 });

     const slotRows = ((slots ?? []) as AvailabilityRow[]).filter(
       (s) => s && typeof s.weekday === "number"
     );

     // ✅ MA REGLE (corrige ton bug):
     // - si 0 ligne => fallback legacy (ouvert)
     // - si ≥1 ligne => planning configuré => obligatoire (même si tout OFF)
     const planningConfigured = slotRows.length > 0;

     if (planningConfigured) {
       const anyEnabled = slotRows.some((s) => !!s.enabled);

       // tout OFF => fermé
       if (!anyEnabled) {
         return NextResponse.json(
           {
             ok: false,
             error: "Créneau indisponible",
             detail: "Cette place est fermée (planning OFF).",
             code: "OUTSIDE_AVAILABILITY",
           },
           { status: 409 }
         );
       }

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
