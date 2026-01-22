// app/my-parkings/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type ParkingRow = {
  id: string;
  owner_id: string;
  title: string;
  address: string;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  parking_type: "outdoor" | "indoor" | "garage" | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  price_hour: number | null;
  price_day: number | null;

  photos: string[] | null;
  is_active: boolean | null;

  created_at: string;
};

type StripeStatusOk = {
  ok: true;
  stripeAccountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

type StripeStatusErr = { ok: false; error: string; detail?: string };
type StripeStatusResp = StripeStatusOk | StripeStatusErr;

function typeLabel(t: ParkingRow["parking_type"]) {
  if (t === "indoor") return "Intérieur";
  if (t === "garage") return "Garage";
  return "Extérieur";
}

function safeFirstPhoto(p: ParkingRow) {
  const u = p.photos?.[0];
  return typeof u === "string" && u.trim().length > 0 ? u : null;
}

export default function MyParkingsPage() {
  const { ready, session, supabase } = useAuth();

  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Stripe Connect status
  const [stripeStatus, setStripeStatus] = useState<StripeStatusOk | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeErr, setStripeErr] = useState<string | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  // ✅ delete loading (per card)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    if (!session) return;

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("parkings")
      .select(
        `
        id,
        owner_id,
        title,
        address,
        street,
        street_number,
        postal_code,
        city,
        parking_type,
        is_covered,
        has_ev_charger,
        is_secure,
        is_lit,
        price_hour,
        price_day,
        photos,
        is_active,
        created_at
      `
      )
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ParkingRow[]);
    }

    setLoading(false);
  };

  const fetchStripeStatus = async () => {
    if (!session) return;

    setStripeLoading(true);
    setStripeErr(null);

    try {
      const res = await fetch("/api/stripe/connect/status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = (await res.json().catch(() => ({}))) as StripeStatusResp;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg = "error" in json ? json.error : `Erreur (${res.status})`;
        const detail = "detail" in json ? json.detail : undefined;
        setStripeErr(detail ? `${msg} — ${detail}` : msg);
        setStripeStatus(null);
        setStripeLoading(false);
        return;
      }

      setStripeStatus(json);
      setStripeLoading(false);
    } catch (e: unknown) {
      setStripeErr(e instanceof Error ? e.message : "Erreur inconnue (Stripe status)");
      setStripeStatus(null);
      setStripeLoading(false);
    }
  };

  const startOnboarding = async () => {
    if (!session) return;

    setOnboardingLoading(true);
    setStripeErr(null);

    try {
      const res = await fetch("/api/stripe/connect/onboarding", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
        detail?: string;
      };

      if (!res.ok || !json.ok || !json.url) {
        const msg = json.error ?? `Erreur onboarding (${res.status})`;
        const detail = json.detail;
        setStripeErr(detail ? `${msg} — ${detail}` : msg);
        setOnboardingLoading(false);
        return;
      }

      window.location.href = json.url;
    } catch (e: unknown) {
      setStripeErr(e instanceof Error ? e.message : "Erreur inconnue (onboarding)");
      setOnboardingLoading(false);
    }
  };

  const deleteParking = async (p: ParkingRow) => {
    if (!session) return;

    setError(null);

    const ok = window.confirm(
      `Supprimer définitivement la place : "${p.title}" ?\n\n` +
        "Cette action est irréversible. Les données liées (planning/blackouts…) peuvent être supprimées aussi selon ta configuration."
    );

    if (!ok) return;

    if (deletingId) return;
    setDeletingId(p.id);

    try {
      const { error: delErr } = await supabase
        .from("parkings")
        .delete()
        .eq("id", p.id)
        .eq("owner_id", session.user.id);

      if (delErr) {
        setError(delErr.message);
        setDeletingId(null);
        return;
      }

      // ✅ update UI sans re-fetch obligatoire
      setRows((prev) => prev.filter((x) => x.id !== p.id));
      setDeletingId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur suppression");
      setDeletingId(null);
    }
  };

  // ✅ load initial
  useEffect(() => {
    if (!ready || !session) return;
    queueMicrotask(() => {
      void load();
      void fetchStripeStatus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id]);

  const activeCount = useMemo(() => rows.filter((r) => r.is_active).length, [rows]);

  const payoutsReady = Boolean(stripeStatus?.chargesEnabled && stripeStatus?.payoutsEnabled);

  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
    danger: `${UI.btnBase} ${UI.btnDanger}`,
  };

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        {/* Header */}
        <div className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h1}>Mes places</h1>
            <p className={UI.p}>Gérez vos annonces, modifiez les infos, et configurez la disponibilité.</p>

            <div className="flex flex-wrap gap-2 pt-1">
              <span className={UI.chip}>
                {rows.length} place(s) · {activeCount} active(s)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/parkings/new" className={Btn.primary}>
              + Proposer une place
            </Link>

            <button
              type="button"
              onClick={() => {
                void load();
                void fetchStripeStatus();
              }}
              disabled={!session || loading || stripeLoading}
              className={Btn.ghost}
              title={!session ? "Connecte-toi d’abord" : "Rafraîchir"}
            >
              {loading || stripeLoading ? "…" : "Rafraîchir"}
            </button>
          </div>
        </div>

        {!ready ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        ) : !session ? (
          <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
            <p className={UI.p}>Tu dois être connecté pour voir tes places.</p>
            <div className="flex gap-2">
              <Link href="/login" className={Btn.primary}>
                Se connecter
              </Link>
              <Link href="/parkings" className={Btn.ghost}>
                Parcourir les places
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Stripe block */}
            {!payoutsReady ? (
              <div className={`${UI.card} ${UI.cardPad} space-y-4 border-amber-200 bg-amber-50/60`}>
                <div className="space-y-1">
                  <div className="text-base font-semibold text-slate-900">⚠️ Configurer mes paiements</div>
                  <p className="text-sm text-slate-700">
                    Pour recevoir automatiquement l’argent des réservations, tu dois finaliser{" "}
                    <b>Stripe Connect (Express)</b> : IBAN, infos légales, etc.
                  </p>
                </div>

                {stripeErr ? <p className="text-sm text-rose-700">Erreur : {stripeErr}</p> : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className={Btn.primary}
                    onClick={() => void startOnboarding()}
                    disabled={onboardingLoading}
                  >
                    {onboardingLoading ? "Redirection…" : "Configurer mes paiements (Stripe)"}
                  </button>

                  <Link href="/owner/payouts" className={Btn.ghost}>
                    Voir le statut →
                  </Link>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                  <span className={UI.chip}>
                    Dossier envoyé : <b>{stripeStatus?.detailsSubmitted ? "Oui" : "Non"}</b>
                  </span>
                  <span className={UI.chip}>
                    Paiements : <b>{stripeStatus?.chargesEnabled ? "OK" : "Non"}</b>
                  </span>
                  <span className={UI.chip}>
                    Virements : <b>{stripeStatus?.payoutsEnabled ? "OK" : "Non"}</b>
                  </span>
                </div>
              </div>
            ) : (
              <div
                className={`${UI.card} ${UI.cardPad} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-emerald-200 bg-emerald-50/60`}
              >
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">✅ Paiements configurés</div>
                  <p className="text-sm text-slate-700">
                    Stripe Connect est prêt. Tu peux recevoir tes virements automatiquement.
                  </p>
                </div>
                <Link href="/owner/payouts" className={Btn.ghost}>
                  Gérer mes paiements →
                </Link>
              </div>
            )}

            {error ? (
              <div className={`${UI.card} ${UI.cardPad}`}>
                <p className="text-sm text-rose-700">Erreur : {error}</p>
              </div>
            ) : null}

            {rows.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rows.map((p) => {
                  const photo = safeFirstPhoto(p);

                  return (
                    <div key={p.id} className={`${UI.card} ${UI.cardHover} overflow-hidden`}>
                      <div className="h-40 bg-slate-100">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                            Aucune photo
                          </div>
                        )}
                      </div>

                      <div className={`${UI.cardPad} space-y-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{p.title}</div>
                            <div className="text-xs text-slate-500 truncate">{p.address}</div>
                          </div>

                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              p.is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-50 text-slate-600 border border-slate-200"
                            }`}
                            title={p.is_active ? "Active" : "Inactive"}
                          >
                            {p.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className={UI.chip}>{typeLabel(p.parking_type)}</span>
                          <span className={UI.chip}>{p.is_covered ? "Couverte" : "Non couverte"}</span>
                          {p.has_ev_charger ? <span className={UI.chip}>⚡ EV</span> : null}
                          {p.is_secure ? <span className={UI.chip}>🔒 Sécurisé</span> : null}
                          {p.is_lit ? <span className={UI.chip}>💡 Éclairé</span> : null}
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Prix</span>
                          <span className="font-semibold text-slate-900">
                            {p.price_hour !== null ? `${p.price_hour} CHF/h` : "—"}
                            {p.price_day ? ` · ${p.price_day} CHF/j` : ""}
                          </span>
                        </div>

                        <div className={UI.divider} />

                        {/* ✅ actions (sans Réservations) */}
                        <div className="grid grid-cols-2 gap-2">
                          <Link
                            href={`/parkings/${p.id}`}
                            className={`${UI.btnBase} ${UI.btnGhost} w-full`}
                          >
                            Ouvrir
                          </Link>

                          <Link
                            href={`/my-parkings/${p.id}/edit`}
                            className={`${UI.btnBase} ${UI.btnPrimary} w-full`}
                          >
                            Modifier
                          </Link>

                          <Link
                            href={`/my-parkings/${p.id}/availability`}
                            className={`${UI.btnBase} ${UI.btnGhost} w-full`}
                          >
                            Planning
                          </Link>

                          <button
                            type="button"
                            className={`${UI.btnBase} ${UI.btnDanger} w-full`}
                            disabled={deletingId === p.id}
                            onClick={() => void deleteParking(p)}
                          >
                            {deletingId === p.id ? "Suppression…" : "Supprimer"}
                          </button>
                        </div>

                        <p className={UI.subtle}>
                          ID: <span className="font-mono">{p.id}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
                <h2 className={UI.h2}>Aucune place pour le moment</h2>
                <p className={UI.p}>Crée ta première annonce (photos + carte + options).</p>
                <div className="flex flex-wrap gap-2">
                   <Link href="/my-parkings/calendar" className={Btn.ghost}>
    📅 Calendrier
  </Link>

  <Link href="/parkings/new" className={Btn.primary}>
    + Proposer une place
  </Link>

  <Link href="/map" className={Btn.ghost}>
    Voir la carte
  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
