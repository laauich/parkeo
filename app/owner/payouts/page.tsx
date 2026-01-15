"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type StatusOk = {
  ok: true;
  stripeAccountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};
type StatusErr = { ok: false; error: string; detail?: string };
type StatusResp = StatusOk | StatusErr;

export default function OwnerPayoutsPage() {
  const { ready, session } = useAuth();

  const [status, setStatus] = useState<StatusOk | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
  };
  const Card = `${UI.card} ${UI.cardPad}`;

  const fetchStatus = async () => {
    if (!session) return;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/stripe/connect/status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = (await res.json().catch(() => ({}))) as StatusResp;
      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg = "error" in json ? json.error : `Erreur (${res.status})`;
        const detail = "detail" in json ? json.detail : undefined;
        setErr(detail ? `${msg} — ${detail}` : msg);
        setStatus(null);
        setLoading(false);
        return;
      }

      setStatus(json);
      setLoading(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
      setStatus(null);
      setLoading(false);
    }
  };

  const startOnboarding = async () => {
    if (!session) return;
    setOnboardingLoading(true);
    setErr(null);

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
        const msg = json.error ?? `Erreur (${res.status})`;
        const detail = json.detail;
        setErr(detail ? `${msg} — ${detail}` : msg);
        setOnboardingLoading(false);
        return;
      }

      window.location.href = json.url;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
      setOnboardingLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !session) return;
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id]);

  if (!ready) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section}`}>
          <div className={Card}>
            <p className={UI.p}>Chargement…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section}`}>
          <div className={`${Card} space-y-4`}>
            <h1 className={UI.h1}>Configurer mes paiements</h1>
            <p className={UI.p}>Connecte-toi pour configurer Stripe.</p>
            <Link href="/login" className={Btn.primary}>Se connecter</Link>
          </div>
        </div>
      </main>
    );
  }

  const okReady = Boolean(status?.chargesEnabled && status?.payoutsEnabled);

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div className="min-w-0">
            <h1 className={UI.h1}>Configurer mes paiements</h1>
            <p className={UI.p}>
              Pour être payé automatiquement, tu dois finaliser Stripe Connect (Express).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={Btn.ghost}>Mes places</Link>
            <button className={Btn.ghost} onClick={() => void fetchStatus()} disabled={loading}>
              {loading ? "…" : "Rafraîchir"}
            </button>
          </div>
        </header>

        {err ? (
          <div className={`${Card} border-rose-200`}>
            <p className="text-sm text-rose-700">Erreur : {err}</p>
          </div>
        ) : null}

        <div className={Card}>
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">
              {okReady ? "✅ Paiements configurés" : "⚠️ Paiements non configurés"}
            </div>
            <div className="text-xs text-slate-500">
              {status?.stripeAccountId ? `Compte: ${status.stripeAccountId}` : "Aucun compte Stripe"}
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <div><span className="text-slate-500">Dossier envoyé :</span> <b>{status?.detailsSubmitted ? "Oui" : "Non"}</b></div>
            <div><span className="text-slate-500">Paiements activés :</span> <b>{status?.chargesEnabled ? "Oui" : "Non"}</b></div>
            <div><span className="text-slate-500">Virements activés :</span> <b>{status?.payoutsEnabled ? "Oui" : "Non"}</b></div>
          </div>

          <div className={`${UI.divider} my-4`} />

          <button className={Btn.primary} onClick={() => void startOnboarding()} disabled={onboardingLoading}>
            {onboardingLoading ? "Redirection…" : "Configurer mes paiements (Stripe)"}
          </button>

          <p className="mt-3 text-xs text-slate-500">
            Stripe te demandera ton IBAN + tes infos légales. Ensuite Parkeo pourra te reverser automatiquement tes gains.
          </p>
        </div>
      </div>
    </main>
  );
}
