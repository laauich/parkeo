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

function sanitizeBasic(input: string) {
  const s = input.replace(/\s+/g, " ").trim();
  return s.slice(0, 1000);
}

function containsEmailOrPhone(s: string) {
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phoneRe = /(\+?\d[\d\s().-]{7,}\d)/;
  return emailRe.test(s) || phoneRe.test(s);
}

// MVP in-memory rate-limit (ok pour commencer)
const lastByUser: Record<string, number[]> = {};
function allow(userId: string) {
  const now = Date.now();
  const arr = (lastByUser[userId] ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= 30) return false; // 30/min
  if (arr.length > 0 && now - arr[arr.length - 1] < 900) return false; // 900ms min
  arr.push(now);
  lastByUser[userId] = arr;
  return true;
}

// POST { conversationId, body }
export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const raw = (await req.json().catch(() => ({}))) as { conversationId?: string; body?: string };
    if (!raw.conversationId) return NextResponse.json({ ok: false, error: "conversationId manquant" }, { status: 400 });

    const body = sanitizeBasic(raw.body ?? "");
    if (!body) return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 });

    if (containsEmailOrPhone(body)) {
      return NextResponse.json({ ok: false, error: "Contact interdit (email/téléphone)." }, { status: 400 });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!allow(u.user.id)) {
      return NextResponse.json({ ok: false, error: "Trop rapide. Ralentis un peu 🙂" }, { status: 429 });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: c, error: cErr } = await admin
      .from("conversations")
      .select("id, owner_id, client_id")
      .eq("id", raw.conversationId)
      .maybeSingle();

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!c) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });

    const isOwner = u.user.id === c.owner_id;
    const isClient = u.user.id === c.client_id;
    if (!isOwner && !isClient) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const nowIso = new Date().toISOString();

    const { data: msg, error: mErr } = await admin
      .from("messages")
      .insert({ conversation_id: c.id, sender_id: u.user.id, body })
      .select("id,conversation_id,sender_id,body,created_at")
      .maybeSingle();

    if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });

    // update last_message_at
    await admin.from("conversations").update({ last_message_at: nowIso }).eq("id", c.id);

    return NextResponse.json({ ok: true, message: msg }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
