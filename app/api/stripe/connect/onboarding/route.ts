import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe, getAppUrl } from "@/app/lib/stripe";

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

type ApiOk = { ok: true; url: string };
type ApiErr = { ok: false; error: string; detail?: string };

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    // IMPORTANT: en prod tu avais l'erreur APP_BASE_URL manquante
    // getAppUrl() lit APP_BASE_URL depuis env via app/lib/stripe.ts
    const baseUrl = getAppUrl();

    const token = getBearerToken(req);
    if (!token) {
      const payload: ApiErr = { ok: false, error: "Unauthorized" };
      return NextResponse.json(payload, { status: 401 });
    }

    // Auth user
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u?.user) {
      const payload: ApiErr = { ok: false, error: "Unauthorized", detail: uErr?.message };
      return NextResponse.json(payload, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Load profile
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", u.user.id)
      .maybeSingle();

    if (pErr) {
      const payload: ApiErr = { ok: false, error: "DB error", detail: pErr.message };
      return NextResponse.json(payload, { status: 500 });
    }

    let stripeAccountId = (profile?.stripe_account_id ?? "").trim() || null;

    // ✅ Si pas de compte => on le crée PROPREMENT en "individual"
    if (!stripeAccountId) {
      // On recrée ici en reprenant les bons paramètres (même logique que /connect/create)
      const acct = await stripe.accounts.create({
        type: "express",
        country: "CH",
        email: u.user.email ?? undefined,
        business_type: "individual",
        business_profile: {
          url: baseUrl,
          product_description: "Location de places de parking entre particuliers.",
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { userId: u.user.id },
      });

      stripeAccountId = acct.id;

      const { error: upErr } = await admin
        .from("profiles")
        .update({ stripe_account_id: stripeAccountId })
        .eq("id", u.user.id);

      if (upErr) {
        const payload: ApiErr = { ok: false, error: "DB update failed", detail: upErr.message };
        return NextResponse.json(payload, { status: 500 });
      }
    }

    // Create onboarding link
    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      refresh_url: `${baseUrl}/owner/payouts?refresh=1`,
      return_url: `${baseUrl}/owner/payouts?return=1`,
    });

    const payload: ApiOk = { ok: true, url: link.url };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    const payload: ApiErr = { ok: false, error: e instanceof Error ? e.message : "Server error" };
    return NextResponse.json(payload, { status: 500 });
  }
}
