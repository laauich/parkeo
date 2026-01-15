import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/app/lib/stripe";

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

export async function GET(req: Request) {
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
    if (uErr || !u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", u.user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ ok: false, error: "DB error", detail: pErr.message }, { status: 500 });

    const stripeAccountId = profile?.stripe_account_id ?? null;

    // Pas encore de compte
    if (!stripeAccountId) {
      return NextResponse.json(
        {
          ok: true,
          stripeAccountId: null,
          detailsSubmitted: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        },
        { status: 200 }
      );
    }

    const acct = await stripe.accounts.retrieve(stripeAccountId);

    return NextResponse.json(
      {
        ok: true,
        stripeAccountId,
        detailsSubmitted: Boolean(acct.details_submitted),
        chargesEnabled: Boolean(acct.charges_enabled),
        payoutsEnabled: Boolean(acct.payouts_enabled),
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
