// app/api/messages/send/route.ts
import React from "react";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { render } from "@react-email/render";

import NewMessageEmail from "@/app/emails/NewMessageEmail";
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
  conversationId?: string;
  body?: string;
  clientNonce?: string;
};

function sanitizeBasic(input: string) {
  const s = input.replace(/\s+/g, " ").trim();
  return s.slice(0, 2000);
}

function emailPreview(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

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

    // Auth user (via token)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = u.user.id;

    // Admin (service role)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Vérifie accès + récup owner/client
    const { data: c, error: cErr } = await admin
      .from("conversations")
      .select("id, owner_id, client_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!c) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });

    const allowed = c.owner_id === userId || c.client_id === userId;
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const recipientId = c.owner_id === userId ? c.client_id : c.owner_id;
    const senderLabel = c.owner_id === userId ? "Propriétaire" : "Client";

    // Insert message (idempotent via nonce)
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

    // Duplicate nonce => renvoyer l'existant SANS renvoyer email
    if (mErr) {
      const low = String(mErr.message || "").toLowerCase();

      if (clientNonce && low.includes("duplicate")) {
        const { data: existing } = await admin
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at, client_nonce")
          .eq("conversation_id", conversationId)
          .eq("client_nonce", clientNonce)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({ ok: true, message: existing }, { status: 200 });
        }
      }

      return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
    }

    if (!m) return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });

    // Email recipient (best effort)
    try {
      const recipient = await admin.auth.admin.getUserById(recipientId);
      const toEmail = recipient.data?.user?.email ?? null;

      if (toEmail) {
        const from = getFromEmail();
        const appUrl = getAppUrl();
        const conversationUrl = `${appUrl}/messages/${conversationId}`;

        const emailText = `${emailPreview(text)}\n\nOuvrir la conversation : ${conversationUrl}`;

        // ✅ IMPORTANT: pas de JSX dans un .ts -> React.createElement()
        const emailElement = React.createElement(NewMessageEmail, {
          senderName: senderLabel,
          message: emailText,
        });

        // ✅ Certaines versions de @react-email/render retournent Promise<string>
        const html = await render(emailElement);

        await resend.emails.send({
          from,
          to: [toEmail],
          subject: "Nouveau message — Parkeo",
          html,
        });
      }
    } catch (e) {
      console.error("Resend email failed:", e);
      // on n'empêche pas l'envoi du message
    }

    return NextResponse.json({ ok: true, message: m }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
