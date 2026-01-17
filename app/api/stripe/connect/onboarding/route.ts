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

type Ensured = {
  account: Stripe.Account;
  replacedOld: boolean;
  oldId: string | null;
};

async function ensureIndividualExpressAccount(args: {
  stripeAccountId: string | null;
  userId: string;
  email?: string | null;
}): Promise<Ensured> {
  const { stripeAccountId, userId, email } = args;

  const createIndividual = async (meta: Record<string, string | null>) => {
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
      metadata: {
        userId,
        ...meta,
      },
    });

    return created;
  };

  // 1) pas d’account => on crée direct
  if (!stripeAccountId) {
    const created = await createIndividual({ replaced: null, oldAccountId: null });
    return { account: created, replacedOld: false, oldId: null };
  }

  // 2) récupérer l’existant
  const existing = await stripe.accounts.retrieve(stripeAccountId);

  // Stripe peut renvoyer "Stripe.DeletedAccount" dans certains cas
  // -> on teste la présence de "deleted" via un guard robuste
  const isDeleted =
    typeof existing === "object" &&
    existing !== null &&
    "deleted" in existing &&
    (existing as unknown as { deleted?: boolean }).deleted === true;

  if (isDeleted) {
    const created = await createIndividual({ replaced: "deleted_account", oldAccountId: stripeAccountId });
    return { account: created, replacedOld: true, oldId: stripeAccountId };
  }

  // Ici, TypeScript sait que ce n’est pas DeletedAccount
  const acct = existing as Stripe.Account;

  // ✅ bon type => ok
  if (acct.business_type === "individual") {
    return { account: acct, replacedOld: false, oldId: null };
  }

  // ⚠️ si mauvais business_type => recrée un compte clean (le plus fiable)
  const created = await createIndividual({ replaced: "wrong_business_type", oldAccountId: acct.id });
  return { account: created, replacedOld: true, oldId: acct.id };
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

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", userId)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });
    }

    const currentStripeAccountId = profile?.stripe_account_id ?? null;

    // ✅ ensure account exists + individual
    const ensured = await ensureIndividualExpressAccount({
      stripeAccountId: currentStripeAccountId,
      userId,
      email,
    });

    const account = ensured.account;
    const stripeAccountId = account.id;

    // ✅ flags DB (utile pour l’UI)
    const onboardingComplete = Boolean(account.details_submitted && account.payouts_enabled);

    const { error: upErr } = await admin
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

    if (upErr) {
      return NextResponse.json({ ok: false, error: "DB update failed", detail: upErr.message }, { status: 500 });
    }

    // ✅ account link
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
        business_type: account.business_type, // doit être "individual"
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
