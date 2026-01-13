// app/api/messages/send/route.ts
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

type Body = {
  conversationId?: string;
  body?: string;
  clientNonce?: string;
};

function sanitizeBasic(input: string) {
  const s = input.replace(/\s+/g, " ").trim();
  return s.slice(0, 2000);
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const conversationId = body.conversationId?.trim();
    const text = sanitizeBasic(body.body ?? "");
    const clientNonce = body.clientNonce?.trim() || null;

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversationId manquant" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 });
    }

    // Auth user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Admin
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Vérifie que l'utilisateur a accès à la conversation
    const { data: c, error: cErr } = await admin
      .from("conversations")
      .select("id, owner_id, client_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!c) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });

    const userId = u.user.id;
    const allowed = c.owner_id === userId || c.client_id === userId;
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Insert message
    // ✅ grâce à l'index unique (conversation_id, client_nonce), pas de doublon si retry
    const { data: m, error: mErr } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: text,
        client_nonce: clientNonce,
      })
      .select("id, conversation_id, sender_id, body, created_at, client_nonce")
      .maybeSingle();

    if (mErr) {
      // si violation d'unicité nonce, on récupère le message existant
      if (String(mErr.message || "").toLowerCase().includes("duplicate")) {
        const { data: existing } = await admin
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at, client_nonce")
          .eq("conversation_id", conversationId)
          .eq("client_nonce", clientNonce)
          .maybeSingle();

        if (existing) return NextResponse.json({ ok: true, message: existing }, { status: 200 });
      }

      return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
    }

    if (!m) return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });

    return NextResponse.json({ ok: true, message: m }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
