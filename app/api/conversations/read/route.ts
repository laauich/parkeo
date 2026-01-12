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

// POST { conversationId }
export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { conversationId?: string };
    if (!body.conversationId) {
      return NextResponse.json({ ok: false, error: "conversationId manquant" }, { status: 400 });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: c, error: cErr } = await admin
      .from("conversations")
      .select("id, owner_id, client_id")
      .eq("id", body.conversationId)
      .maybeSingle();

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!c) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });

    const isOwner = u.user.id === c.owner_id;
    const isClient = u.user.id === c.client_id;
    if (!isOwner && !isClient) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const patch = isOwner
      ? { last_read_owner_at: new Date().toISOString() }
      : { last_read_client_at: new Date().toISOString() };

    const { error: upErr } = await admin.from("conversations").update(patch).eq("id", c.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
