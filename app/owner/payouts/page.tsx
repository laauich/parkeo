"use client";

import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import { useState } from "react";

export default function OwnerPayoutsPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startOnboarding = async () => {
    if (!session) return;

    setLoading(true);
    setErr(null);

    try {
      // 1) create account if needed
      const r1 = await fetch("/api/stripe/connect/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j1 = await r1.json().catch(() => ({}));
      if (!r1.ok || !j1.ok) throw new Error(j1.error ?? "Erreur create");

      // 2) onboarding link
      const r2 = await fetch("/api/stripe/connect/onboarding", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok || !j2.ok || !j2.url) throw new Error(j2.error ?? "Erreur onboarding");

      window.location.href = j2.url;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
          <h1 className={UI.h1}>Paiements propriétaire</h1>
          <p className={UI.p}>
            Pour recevoir les paiements des clients, tu dois activer Stripe Connect (IBAN + vérification).
          </p>

          {err ? <p className="text-sm text-rose-700">Erreur : {err}</p> : null}

          <button
            className={`${UI.btnBase} ${UI.btnPrimary}`}
            onClick={startOnboarding}
            disabled={!session || loading}
          >
            {loading ? "Ouverture Stripe…" : "Activer mes paiements"}
          </button>
        </div>
      </div>
    </main>
  );
}
