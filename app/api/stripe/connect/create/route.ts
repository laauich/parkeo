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

type ApiOk = { ok: true; stripeAccountId: string; created: boolean };
type ApiErr = { ok: false; error: string; detail?: string };

export async function POST(req: Request) {
  try {
    const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      const payload: ApiErr = { ok: false, error: "Unauthorized" };
      return NextResponse.json(payload, { status: 401 });
    }

    // User via token
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await supabaseAuth.auth.getUser();
    if (uErr || !u.user) {
      const payload: ApiErr = { ok: false, error: "Unauthorized", detail: uErr?.message };
      return NextResponse.json(payload, { status: 401 });
    }

    const user = u.user;
    const email = user.email ?? undefined;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Existing?
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      const payload: ApiErr = { ok: false, error: "DB error", detail: pErr.message };
      return NextResponse.json(payload, { status: 500 });
    }

    if (profile?.stripe_account_id) {
      const payload: ApiOk = { ok: true, stripeAccountId: profile.stripe_account_id, created: false };
      return NextResponse.json(payload, { status: 200 });
    }

    // ✅ Create Express Connect account as INDIVIDUAL
    const account = await stripe.accounts.create({
      type: "express",
      country: "CH",
      email,
      business_type: "individual",
      business_profile: {
        url: getAppUrl(),
        product_description: "Location de places de parking entre particuliers",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { userId: user.id },
    });

    // Save to profiles + reset flags
    const { error: upErr } = await admin
      .from("profiles")
      .update({
        stripe_account_id: account.id,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
        stripe_onboarding_complete: false,
        stripe_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (upErr) {
      const payload: ApiErr = { ok: false, error: "DB update failed", detail: upErr.message };
      return NextResponse.json(payload, { status: 500 });
    }

    const payload: ApiOk = { ok: true, stripeAccountId: account.id, created: true };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    const payload: ApiErr = { ok: false, error: e instanceof Error ? e.message : "Server error" };
    return NextResponse.json(payload, { status: 500 });
  }
}
