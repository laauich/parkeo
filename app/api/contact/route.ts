// app/api/contact/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function clamp(s: string, max: number) {
  const v = (s ?? "").toString();
  return v.length > max ? v.slice(0, max) : v;
}

// Rate limit très simple (process memory)
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0 };
  cur.count += 1;
  hits.set(key, cur);
  return { ok: true, remaining: limit - cur.count };
}

function pickFromEmail(resendFrom: string, supportEmail: string) {
  // ✅ ne casse rien : si RESEND_FROM_EMAIL est clean, on le garde
  // ✅ si quelqu’un remet "noreply", on force un FROM sans "no-reply" pour éviter le warning Resend
  const lower = resendFrom.toLowerCase();
  if (lower.includes("no-reply") || lower.includes("noreply")) {
    return `Parkeo <${supportEmail}>`;
  }
  return resendFrom;
}

export async function POST(req: Request) {
  try {
    const resendKey = env("RESEND_API_KEY");

    // Support mail configurable, sinon fallback
    const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || "support@parkeo.ch").trim();

    // Important: With Resend, "from" doit être sur un domaine vérifié.
    const RESEND_FROM_EMAIL = env("RESEND_FROM_EMAIL");
    const FROM_EMAIL = pickFromEmail(RESEND_FROM_EMAIL, SUPPORT_EMAIL);

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "unknown";

    const rl = rateLimit(`contact:${ip}`);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "Trop de demandes. Réessaie dans quelques minutes." },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
      company?: string;
      // anti-spam
      website?: string; // honeypot (doit rester vide)
      startedAt?: number; // timestamp côté client (anti-bot timing)
      page?: string;
    };

    // Honeypot
    if (body.website && String(body.website).trim().length > 0) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const startedAt = Number(body.startedAt ?? 0);
    if (Number.isFinite(startedAt)) {
      const dt = Date.now() - startedAt;
      if (dt > 0 && dt < 800) {
        return NextResponse.json(
          { ok: false, error: "Validation anti-spam. Réessaie." },
          { status: 400 }
        );
      }
    }

    const name = clamp(String(body.name ?? "").trim(), 80);
    const email = clamp(String(body.email ?? "").trim(), 120);
    const subject = clamp(String(body.subject ?? "").trim(), 120);
    const company = clamp(String(body.company ?? "").trim(), 120);
    const message = clamp(String(body.message ?? "").trim(), 3000);
    const page = clamp(String(body.page ?? "").trim(), 200);

    if (!name || name.length < 2) {
      return NextResponse.json({ ok: false, error: "Nom invalide." }, { status: 400 });
    }
    if (!email || !isEmail(email)) {
      return NextResponse.json({ ok: false, error: "Email invalide." }, { status: 400 });
    }
    if (!message || message.length < 10) {
      return NextResponse.json({ ok: false, error: "Message trop court." }, { status: 400 });
    }

    const resend = new Resend(resendKey);

    // Email vers support
    const supportSubject = subject
      ? `Parkeo — Contact: ${subject}`
      : `Parkeo — Nouveau message de ${name}`;

    const supportHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
        <h2 style="margin:0 0 12px">Nouveau message — Parkeo</h2>
        <p style="margin:0 0 8px"><b>Nom:</b> ${escapeHtml(name)}</p>
        <p style="margin:0 0 8px"><b>Email:</b> ${escapeHtml(email)}</p>
        ${company ? `<p style="margin:0 0 8px"><b>Entreprise:</b> ${escapeHtml(company)}</p>` : ""}
        ${subject ? `<p style="margin:0 0 8px"><b>Sujet:</b> ${escapeHtml(subject)}</p>` : ""}
        ${page ? `<p style="margin:0 0 8px"><b>Page:</b> ${escapeHtml(page)}</p>` : ""}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0" />
        <pre style="white-space:pre-wrap;margin:0;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:10px">${escapeHtml(
          message
        )}</pre>
        <p style="margin:16px 0 0;color:#64748b;font-size:12px">Reply-To = email du client</p>
      </div>
    `;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      subject: supportSubject,
      html: supportHtml,
      replyTo: email,
      // @ts-expect-error compat older/newer SDK naming
      reply_to: email,
    });

    // Email de confirmation au client (premium)
    const confirmHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">
        <h2 style="margin:0 0 12px">Nous avons bien reçu ton message ✅</h2>
        <p style="margin:0 0 10px">Merci <b>${escapeHtml(name)}</b>, l’équipe Parkeo revient vers toi au plus vite.</p>
        ${subject ? `<p style="margin:0 0 10px"><b>Sujet:</b> ${escapeHtml(subject)}</p>` : ""}
        <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:10px">
          <div style="color:#64748b;font-size:12px;margin-bottom:6px">Copie de ton message</div>
          <div style="white-space:pre-wrap">${escapeHtml(message)}</div>
        </div>
        <p style="margin:14px 0 0;color:#64748b;font-size:12px">
          Ce message a été envoyé automatiquement. Si besoin, réponds à cet email.
        </p>
      </div>
    `;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Parkeo — Message reçu ✅",
      html: confirmHtml,
      replyTo: SUPPORT_EMAIL,
      // @ts-expect-error compat older/newer SDK naming
      reply_to: SUPPORT_EMAIL,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    console.error("CONTACT_ERROR:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
