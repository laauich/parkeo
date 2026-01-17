import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe, getAppUrl } from "@/app/lib/stripe";
import type Stripe from "stripe";

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

async function ensureIndividualExpressAccount(args: {
  stripeAccountId: string | null;
  userId: string;
  email?: string | null;
}) {
  const { stripeAccountId, userId, email } = args;

  // 1) si pas d’account -> créer direct en individual
  if (!stripeAccountId) {
    const created = await stripe.accounts.create({
      type: "express",
      country: "CH",
      email: email ?? undefined,
      business_type: "individual",
      business_profile: {
        url: getAppUrl(),
        product_description: "Location de places de parking entre particuliers",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { userId },
    });

    return { account: created, replacedOld: false, oldId: null };
  }

  // 2) sinon récupérer et vérifier business_type
  const existing = await stripe.accounts.retrieve(stripeAccountId);

  // Stripe renvoie parfois deleted = true
  // @ts-expect-error (Stripe types allow deleted accounts)
  if ((existing as any)?.deleted) {
    const created = await stripe.accounts.create({
      type: "express",
      country: "CH",
      email: email ?? undefined,
      business_type: "individual",
      business_profile: {
        url: getAppUrl(),
        product_description: "Location de places de parking entre particuliers",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { userId, replaced: "deleted_account", oldAccountId: stripeAccountId },
    });

    return { account: created, replacedOld: true, oldId: stripeAccountId };
  }

  // ✅ si déjà individual -> parfait
  if (existing.business_type === "individual") {
    return { account: existing, replacedOld: false, oldId: null };
  }

  /**
   * ⚠️ IMPORTANT
   * Si le compte est "company" ou autre, en pratique Stripe ne te permet pas
   * toujours de basculer proprement business_type sur Express.
   * Le plus fiable : recréer un compte propre en individual.
   */
  const created = await stripe.accounts.create({
    type: "express",
    country: "CH",
    email: email ?? undefined,
    business_type: "individual",
    business_profile: {
      url: getAppUrl(),
      product_description: "Location de places de parking entre particuliers",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { userId, replaced: "wrong_business_type", oldAccountId: existing.id },
  });

  return { account: created, replacedOld: true, oldId: existing.id };
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = u.user.id;
    const email = u.user.email ?? null;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Load profile
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", userId)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });
    }

    const currentStripeAccountId = profile?.stripe_account_id ?? null;

    // ✅ Ensure account exists AND is business_type=individual
    const ensured = await ensureIndividualExpressAccount({
      stripeAccountId: currentStripeAccountId,
      userId,
      email,
    });

    const account = ensured.account as Stripe.Account;
    const stripeAccountId = account.id;

    // ✅ Sync flags in Supabase (ça aide à voir l’état réel)
    const onboardingComplete = Boolean(account.details_submitted && account.payouts_enabled);

    await admin
      .from("profiles")
      .update({
        stripe_account_id: stripeAccountId,
        stripe_charges_enabled: account.charges_enabled ?? false,
        stripe_payouts_enabled: account.payouts_enabled ?? false,
        stripe_details_submitted: account.details_submitted ?? false,
        stripe_onboarding_complete: onboardingComplete,
        stripe_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    // Create account link
    const baseUrl = getAppUrl();

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      refresh_url: `${baseUrl}/owner/payouts?refresh=1`,
      return_url: `${baseUrl}/owner/payouts?return=1`,
    });

    return NextResponse.json(
      {
        ok: true,
        url: link.url,
        stripeAccountId,
        business_type: account.business_type, // pour debug => "individual"
        replacedOldAccount: ensured.replacedOld,
        oldAccountId: ensured.oldId,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
