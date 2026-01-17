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

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    // user via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", u.user.id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });
    }

    let stripeAccountId = profile?.stripe_account_id ?? null;

    // ✅ SI pas de compte => on crée un compte Express "individual"
    if (!stripeAccountId) {
      const baseUrl = getAppUrl();

      const acct = await stripe.accounts.create({
        type: "express",
        country: "CH",
        email: u.user.email ?? undefined,

        // ✅ CRUCIAL => forcer particulier
        business_type: "individual",

        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },

        // ✅ évite que Stripe bloque pour "site web" => on préremplit ton site
        business_profile: {
          url: baseUrl,
          product_description: "Location de places de parking via Parkeo",
        },

        metadata: { userId: u.user.id },
      });

      stripeAccountId = acct.id;

      const { error: upErr } = await admin
        .from("profiles")
        .update({ stripe_account_id: stripeAccountId })
        .eq("id", u.user.id);

      if (upErr) {
        return NextResponse.json(
          { ok: false, error: "DB update failed", detail: upErr.message },
          { status: 500 }
        );
      }
    }

    // ✅ Link onboarding
    const baseUrl = getAppUrl();
    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      refresh_url: `${baseUrl}/owner/payouts?refresh=1`,
      return_url: `${baseUrl}/owner/payouts?return=1`,
    });

    return NextResponse.json({ ok: true, url: link.url }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
