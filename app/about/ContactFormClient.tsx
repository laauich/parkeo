// app/about/ContactFormClient.tsx
"use client";

import { useMemo, useState } from "react";
import { UI } from "@/app/components/ui";
import { toast } from "sonner";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

type FormState = {
  name: string;
  email: string;
  subject: string;
  company: string;
  message: string;

  // honeypot (doit rester vide)
  website: string;
};

export default function ContactFormClient() {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    subject: "",
    company: "",
    message: "",
    website: "",
  });

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const startedAt = useMemo(() => Date.now(), []);

  const msgLeft = 3000 - (form.message?.length ?? 0);

  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
  };

  const onChange = (k: keyof FormState, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const validate = () => {
    if (!form.name.trim() || form.name.trim().length < 2) return "Nom invalide.";
    if (!form.email.trim() || !isEmail(form.email.trim())) return "Email invalide.";
    if (!form.message.trim() || form.message.trim().length < 10) return "Message trop court.";
    if (form.message.length > 3000) return "Message trop long.";
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) {
      toast.error(v);
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          company: form.company.trim(),
          message: form.message.trim(),
          website: form.website, // honeypot
          startedAt,
          page: "/about",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? `Erreur (${res.status})`);
        setSending(false);
        return;
      }

      toast.success("Message envoyé ✅");
      setSent(true);
      setForm((p) => ({ ...p, subject: "", company: "", message: "", website: "" }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-12">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur p-6 sm:p-7 space-y-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-600/10 flex items-center justify-center text-violet-700 font-semibold shrink-0">
              ✉️
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                Contact & Support
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Dis-nous ce qu’il se passe — on répond rapidement.
              </p>

              <div className="flex flex-wrap gap-2 mt-3">
                <span className={UI.chip}>
                  Support : <b>support@parkeo.ch</b>
                </span>
                <span className={`${UI.chip} bg-emerald-50 border-emerald-200 text-emerald-700`}>
                  Réponse sous 24h ouvrées
                </span>
              </div>
            </div>
          </div>

          {/* Success banner */}
          {sent ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="font-semibold text-emerald-900">Message envoyé ✅</div>
              <div className="text-sm text-emerald-800 mt-1">
                Tu recevras une confirmation par email. Si tu ne la vois pas, check tes spams.
              </div>
            </div>
          ) : null}

          {/* Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Nom</label>
              <input
                className={UI.input}
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="Ton nom"
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Email</label>
              <input
                className={UI.input}
                value={form.email}
                onChange={(e) => onChange("email", e.target.value)}
                placeholder="ton@email.ch"
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Sujet <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <input
                className={UI.input}
                value={form.subject}
                onChange={(e) => onChange("subject", e.target.value)}
                placeholder="Ex: Problème de réservation"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Entreprise <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <input
                className={UI.input}
                value={form.company}
                onChange={(e) => onChange("company", e.target.value)}
                placeholder="Ex: Parkeo SA"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-slate-900">Message</label>
                <span className="text-xs text-slate-500">
                  {msgLeft} caractères restants
                </span>
              </div>
              <textarea
                className={`${UI.input} min-h-[140px] resize-none leading-relaxed`}
                value={form.message}
                onChange={(e) => onChange("message", e.target.value)}
                placeholder="Explique-nous ton besoin (le plus de détails possible)."
              />
            </div>

            {/* Honeypot invisible (anti-bot) */}
            <div className="hidden">
              <label>Website</label>
              <input
                value={form.website}
                onChange={(e) => onChange("website", e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              className={Btn.primary}
              onClick={submit}
              disabled={sending}
            >
              {sending ? "Envoi…" : "Envoyer le message"}
            </button>

            <a
              href="mailto:support@parkeo.ch"
              className={Btn.ghost}
              onClick={() => toast.message("Ouverture de ton client mail…")}
            >
              Ou écrire directement
            </a>
          </div>

          <div className="text-xs text-slate-500 pt-2 border-t border-slate-200/70">
            Astuce : si c’est lié à une réservation, indique l’ID réservation dans ton message.
          </div>
        </div>
      </div>
    </section>
  );
}
