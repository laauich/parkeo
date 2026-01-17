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

type ApiOk = {
  ok: true;
  stripeAccountId: string;
  created: boolean;
};

type ApiErr = {
  ok: false;
  error: string;
  detail?: string;
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    // 🔐 Auth header
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" } satisfies ApiErr,
        { status: 401 }
      );
    }

    // 🔐 User via Supabase Auth
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", detail: uErr?.message } satisfies ApiErr,
        { status: 401 }
      );
    }

    const user = u.user;
    const email = user.email ?? undefined;

    // 🔑 Admin Supabase
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 🔍 Check existing Stripe account
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json(
        { ok: false, error: "DB error", detail: pErr.message } satisfies ApiErr,
        { status: 500 }
      );
    }

    // ✅ Déjà existant → on renvoie
    if (profile?.stripe_account_id) {
      return NextResponse.json(
        {
          ok: true,
          stripeAccountId: profile.stripe_account_id,
          created: false,
        } satisfies ApiOk,
        { status: 200 }
      );
    }

    // =====================================================
    // ✅ CRÉATION STRIPE CONNECT — PARTICULIER (INDIVIDUAL)
    // =====================================================
    const account = await stripe.accounts.create({
      type: "express",
      country: "CH",
      email,

      // 🔑 LE POINT CRUCIAL (bloque définitivement le mode entreprise)
      business_type: "individual",

      // ⚠️ IMPORTANT : évite que Stripe exige une société
      business_profile: {
        url: getAppUrl(), // ex: https://parkeo.ch
        product_description: "Location de places de parking entre particuliers",
      },

      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },

      metadata: {
        userId: user.id,
      },
    });

    // 💾 Sauvegarde en DB
    const { error: upErr } = await admin
      .from("profiles")
      .update({
        stripe_account_id: account.id,
        stripe_onboarding_complete: false,
        stripe_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: "DB update failed", detail: upErr.message } satisfies ApiErr,
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        stripeAccountId: account.id,
        created: true,
      } satisfies ApiOk,
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
