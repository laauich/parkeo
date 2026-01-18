// app/my-parkings/bookings/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import { useRouter } from "next/navigation";
import ConfirmModal from "@/app/components/ConfirmModal";

type ParkingJoin = {
  id: string;
  title: string | null;
  address: string | null;
  photos: string[] | string | null;
};

type BookingRow = {
  id: string;
  parking_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  total_price: number | null;
  currency: string | null;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;

  // (optionnels si ta DB les a)
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  refund_status?: string | null; // refunded | requested | requested_owner | missing_intent | failed | none ...
  refund_id?: string | null;

  // Option 2
  owner_paid_out?: boolean | null;

  parkings?: ParkingJoin[] | ParkingJoin | null;
};

type CancelOk = { ok: true; refunded?: boolean; already?: boolean };
type CancelErr = { ok: false; error: string; detail?: string };
type CancelApiResponse = CancelOk | CancelErr;

type EnsureChatOk = { ok: true; conversationId: string };
type EnsureChatErr = { ok: false; error: string; detail?: string };
type EnsureChatResponse = EnsureChatOk | EnsureChatErr;

type TabKey = "upcoming" | "past" | "cancelled";

const PLATFORM_FEE_PERCENT = 0.15; // ✅ commission Parkeo (affichage seulement)
const OWNER_NET_PERCENT = 1 - PLATFORM_FEE_PERCENT;

// ===== Option 2: Wallet + Monthly (routes API) =====
type WalletApiOk = {
  ok: true;
  currency: string;
  pending: number;
  available: number;
  paidOut: number;
  total: number;
};
type WalletApiErr = { ok: false; error: string; detail?: string };
type WalletApiResponse = WalletApiOk | WalletApiErr;

type MonthlyApiOk = {
  ok: true;
  currency: string;
  items: Array<{ month: string; total: number }>;
};
type MonthlyApiErr = { ok: false; error: string; detail?: string };
type MonthlyApiResponse = MonthlyApiOk | MonthlyApiErr;

// ===== Helpers =====
function getParkingFromJoin(join: BookingRow["parkings"]): ParkingJoin | null {
  if (!join) return null;
  if (Array.isArray(join)) return join[0] ?? null;
  return join;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(v: number | null, currency?: string | null) {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v} ${(currency ?? "CHF").toUpperCase()}`;
}

function moneyPretty(amount: number, currency?: string | null) {
  const cur = (currency ?? "CHF").toUpperCase();
  if (!Number.isFinite(amount)) return `— ${cur}`;
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${cur}`;
}

function parsePhotos(raw: ParkingJoin["photos"]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("http")) return [s];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

function firstPhotoUrl(photos: string[]): string | null {
  const u = photos[0];
  return u ? u : null;
}

function isCancelled(b: BookingRow) {
  return (b.status ?? "").toLowerCase() === "cancelled";
}

function isPast(b: BookingRow, nowMs: number) {
  const end = new Date(b.end_time).getTime();
  if (Number.isNaN(end)) return false;
  return end <= nowMs;
}

function canChat(b: BookingRow, nowMs: number) {
  return !isCancelled(b) && !isPast(b, nowMs);
}

function canCancelOwner(b: BookingRow, nowMs: number) {
  return !isCancelled(b) && !isPast(b, nowMs);
}

function refundBadge(b: BookingRow) {
  const rs = (b.refund_status ?? "").toLowerCase();
  const paid = (b.payment_status ?? "").toLowerCase();

  if (!rs) {
    if (paid === "refunded") return { label: "Remboursée", tone: "success" as const };
    if (paid === "refunding") return { label: "Remboursement en cours", tone: "warning" as const };
    return null;
  }

  if (rs === "refunded") return { label: "Remboursée", tone: "success" as const };
  if (rs.includes("request")) return { label: "Remboursement en cours", tone: "warning" as const };
  if (rs === "missing_intent") return { label: "Remboursement impossible", tone: "danger" as const };
  if (rs === "failed") return { label: "Remboursement échoué", tone: "danger" as const };
  if (rs === "none") return { label: "Aucun remboursement", tone: "info" as const };

  return { label: rs, tone: "info" as const };
}

function ownerSummary(b: BookingRow) {
  const paid = (b.payment_status ?? "").toLowerCase() === "paid";
  if (paid) {
    return {
      badge: "Remboursement ✅",
      tone: "warning" as const,
      title: "Le client sera remboursé",
      text: `Annulation propriétaire : remboursement automatique de ${b.total_price ?? "—"} ${
        b.currency ?? "CHF"
      }.`,
    };
  }
  return {
    badge: "Non payé",
    tone: "info" as const,
    title: "Réservation non payée",
    text: "Annulation simple (pas de remboursement).",
  };
}

export default function OwnerBookingsGlobalPage() {
  const { ready, session, supabase } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);

  // Détails modal
  const [openBooking, setOpenBooking] = useState<BookingRow | null>(null);

  // ConfirmModal annulation
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<BookingRow | null>(null);
  const [modalLines, setModalLines] = useState<string[]>([]);
  const [modalSummary, setModalSummary] = useState<
    { badge?: string; title?: string; text?: string } | undefined
  >(undefined);
  const [modalTone, setModalTone] = useState<"success" | "warning" | "danger" | "info">("info");

  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);
  const [returnToDetails, setReturnToDetails] = useState<BookingRow | null>(null);

  // ✅ onglets
  const [tab, setTab] = useState<TabKey>("upcoming");

  const userId = session?.user?.id ?? null;

  // ✅ éviter Date.now dans render + même logique partout
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ===== Option 2 states =====
  const [wallet, setWallet] = useState<WalletApiOk | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);

  const [monthly, setMonthly] = useState<MonthlyApiOk | null>(null);
  const [monthlyErr, setMonthlyErr] = useState<string | null>(null);

  const loadWallet = async () => {
    if (!session) return;
    setWalletErr(null);
    try {
      const res = await fetch("/api/owner/wallet", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json().catch(() => ({}))) as WalletApiResponse;
      if (!res.ok || !json || ("ok" in json && json.ok === false)) {
        const msg =
          (json && "detail" in json && json.detail)
            ? `${(json as WalletApiErr).error} — ${(json as WalletApiErr).detail}`
            : (json && "error" in json && (json as WalletApiErr).error)
              ? (json as WalletApiErr).error
              : `Erreur portefeuille (${res.status})`;
        setWalletErr(msg);
        setWallet(null);
        return;
      }
      setWallet(json as WalletApiOk);
    } catch (e: unknown) {
      setWalletErr(e instanceof Error ? e.message : "Erreur portefeuille");
      setWallet(null);
    }
  };

  const loadMonthly = async () => {
    if (!session) return;
    setMonthlyErr(null);
    try {
      const res = await fetch("/api/owner/earnings/monthly", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json().catch(() => ({}))) as MonthlyApiResponse;
      if (!res.ok || !json || ("ok" in json && json.ok === false)) {
        const msg =
          (json && "detail" in json && json.detail)
            ? `${(json as MonthlyApiErr).error} — ${(json as MonthlyApiErr).detail}`
            : (json && "error" in json && (json as MonthlyApiErr).error)
              ? (json as MonthlyApiErr).error
              : `Erreur graphique (${res.status})`;
        setMonthlyErr(msg);
        setMonthly(null);
        return;
      }
      setMonthly(json as MonthlyApiOk);
    } catch (e: unknown) {
      setMonthlyErr(e instanceof Error ? e.message : "Erreur graphique");
      setMonthly(null);
    }
  };

  const load = async () => {
    if (!ready) return;

    if (!session || !userId) {
      setRows([]);
      setErr(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    // ⚠️ IMPORTANT: si chez toi c’est parkings.user_id au lieu de owner_id => remplace ci-dessous.
    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        id,
        parking_id,
        user_id,
        start_time,
        end_time,
        total_price,
        currency,
        status,
        payment_status,
        created_at,
        cancelled_at,
        cancelled_by,
        refund_status,
        refund_id,
        owner_paid_out,
        parkings:parking_id!inner ( id, title, address, photos, owner_id )
      `
      )
      .eq("parkings.owner_id", userId)
      .order("start_time", { ascending: false })
      .limit(500);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as unknown as BookingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => void load());
    // Option 2 loads
    queueMicrotask(() => void loadWallet());
    queueMicrotask(() => void loadMonthly());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id]);

  // ✅ filtres (3 onglets)
  const cancelled = useMemo(() => rows.filter((b) => isCancelled(b)), [rows]);

  const upcoming = useMemo(() => {
    return rows.filter((b) => !isCancelled(b) && !isPast(b, nowMs));
  }, [rows, nowMs]);

  const past = useMemo(() => {
    return rows.filter((b) => !isCancelled(b) && isPast(b, nowMs));
  }, [rows, nowMs]);

  const visibleRows = useMemo(() => {
    if (tab === "upcoming") return upcoming;
    if (tab === "cancelled") return cancelled;
    return past;
  }, [tab, upcoming, past, cancelled]);

  // ✅ auto-switch si onglet vide
  useEffect(() => {
    if (loading) return;
    if (rows.length === 0) return;

    const counts = {
      upcoming: upcoming.length,
      past: past.length,
      cancelled: cancelled.length,
    };

    if (counts[tab] > 0) return;

    if (counts.upcoming > 0) setTab("upcoming");
    else if (counts.past > 0) setTab("past");
    else if (counts.cancelled > 0) setTab("cancelled");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows.length, upcoming.length, past.length, cancelled.length]);

  // ✅ fallback stats (si wallet route pas encore dispo)
  const statsFallback = useMemo(() => {
    const paidRows = rows.filter((b) => {
      const paid = (b.payment_status ?? "").toLowerCase() === "paid";
      return paid && !isCancelled(b) && (b.total_price ?? 0) > 0;
    });

    const currency = (paidRows.find((b) => b.currency)?.currency ?? "CHF").toUpperCase();
    const gross = paidRows.reduce((acc, b) => acc + (b.total_price ?? 0), 0);
    const netEstimate = gross * OWNER_NET_PERCENT;

    const now = new Date(nowMs);
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const monthGross = paidRows.reduce((acc, b) => {
      const d = new Date(b.start_time);
      if (Number.isNaN(d.getTime())) return acc;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === ym ? acc + (b.total_price ?? 0) : acc;
    }, 0);

    return {
      currency,
      paidCount: paidRows.length,
      gross,
      netEstimate,
      monthGross,
    };
  }, [rows, nowMs]);

  // ===== Actions =====
  const openChat = async (bookingId: string) => {
    if (!session) return;

    const b = rows.find((x) => x.id === bookingId) ?? openBooking;
    if (b && !canChat(b, nowMs)) {
      setErr("Chat indisponible : réservation passée ou annulée.");
      return;
    }

    if (chatLoadingId) return;
    setChatLoadingId(bookingId);
    setErr(null);

    try {
      const res = await fetch("/api/conversations/ensure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId }),
      });

      const json = (await res.json().catch(() => ({}))) as EnsureChatResponse;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg =
          ("detail" in json && json.detail)
            ? `${json.error ?? "Erreur chat"} — ${json.detail}`
            : ("error" in json && json.error)
              ? json.error
              : `Erreur chat (${res.status})`;
        setErr(msg);
        return;
      }

      router.push(`/messages/${json.conversationId}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue (chat)");
    } finally {
      setChatLoadingId(null);
    }
  };

  const openOwnerCancelModal = (b: BookingRow) => {
    setErr(null);

    if (!canCancelOwner(b, nowMs)) {
      setErr("Annulation impossible : réservation passée ou déjà annulée.");
      return;
    }

    const s = ownerSummary(b);

    if (openBooking) {
      setReturnToDetails(openBooking);
      setOpenBooking(null);
    } else {
      setReturnToDetails(b);
    }

    setPendingCancel(b);
    setModalSummary({ badge: s.badge, title: s.title, text: s.text });
    setModalTone(s.tone);

    setModalLines([
      `Début : ${formatDateTime(b.start_time)}`,
      `Fin : ${formatDateTime(b.end_time)}`,
      `Prix : ${money(b.total_price, b.currency)}`,
      `Paiement : ${b.payment_status ?? "—"}`,
      "",
      "Confirmer l’annulation ?",
    ]);

    setModalOpen(true);
  };

  const doCancelOwner = async () => {
    if (!session || !pendingCancel) return;

    if (cancelLoadingId) return;
    setCancelLoadingId(pendingCancel.id);
    setErr(null);

    try {
      const res = await fetch("/api/owner/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId: pendingCancel.id }),
      });

      const json = (await res.json().catch(() => ({}))) as CancelApiResponse;

      if (!res.ok || !("ok" in json) || json.ok === false) {
        const msg =
          ("detail" in json && json.detail)
            ? `${json.error ?? "Erreur annulation"} — ${json.detail}`
            : ("error" in json && json.error)
              ? json.error
              : `Erreur annulation (${res.status})`;

        setErr(msg);
        setModalOpen(false);
        setPendingCancel(null);
        return;
      }

      await load();
      await loadWallet();
      await loadMonthly();

      setReturnToDetails(null);
      setModalOpen(false);
      setPendingCancel(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur inconnue (annulation)");
      setModalOpen(false);
      setPendingCancel(null);
    } finally {
      setCancelLoadingId(null);
    }
  };

  const Btn = {
    primary: `${UI.btnBase} ${UI.btnPrimary}`,
    ghost: `${UI.btnBase} ${UI.btnGhost}`,
    danger: `${UI.btnBase} ${UI.btnDanger}`,
  };

  const Card = `${UI.card} ${UI.cardPad}`;

  const tabBtnClass = (active: boolean) =>
    [UI.btnBase, active ? UI.btnPrimary : UI.btnGhost, "rounded-full", "px-4 py-2", "w-full sm:w-auto"].join(" ");

  const tabTitle = tab === "upcoming" ? "À venir" : tab === "past" ? "Passées" : "Annulées";

  const walletCurrency = wallet?.currency ?? statsFallback.currency;
  const walletTotal = wallet?.total ?? statsFallback.netEstimate;
  const walletPending = wallet?.pending ?? 0;
  const walletAvailable = wallet?.available ?? 0;
  const walletPaidOut = wallet?.paidOut ?? 0;

  if (!ready) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section}`}>
          <div className={`${UI.card} ${UI.cardPad}`}>
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
          <div className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <h1 className={UI.h1}>Réservations (mes places)</h1>
            <p className={UI.p}>Connecte-toi pour voir les réservations.</p>
            <Link href="/login" className={Btn.primary}>
              Se connecter
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={UI.page}>
      <ConfirmModal
        open={modalOpen}
        title="Annuler (propriétaire)"
        lines={modalLines}
        summary={modalSummary}
        summaryTone={modalTone}
        confirmLabel="Confirmer l’annulation"
        cancelLabel="Retour"
        danger
        loading={!!cancelLoadingId}
        onClose={() => {
          if (cancelLoadingId) return;

          setModalOpen(false);
          setPendingCancel(null);

          if (returnToDetails) {
            setOpenBooking(returnToDetails);
            setReturnToDetails(null);
          }
        }}
        onConfirm={doCancelOwner}
      />

      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>Réservations (mes places)</h1>
            <p className={UI.p}>Toutes les réservations sur toutes tes places.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={Btn.ghost}>
              Mes places
            </Link>
            <button
              className={Btn.ghost}
              onClick={() => {
                void load();
                void loadWallet();
                void loadMonthly();
              }}
              disabled={loading}
            >
              {loading ? "…" : "Rafraîchir"}
            </button>
          </div>
        </header>

        {/* ===== Option 2: Wallet + Graph + Tabs ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Wallet (Option 2) */}
          <div className={`${UI.card} ${UI.cardPad} lg:col-span-2 overflow-hidden relative`}>
            <div
              className={[
                "absolute inset-0 -z-10 opacity-60",
                "bg-gradient-to-r from-violet-200/60 via-white/30 to-violet-200/60",
              ].join(" ")}
            />

            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-slate-600">Portefeuille propriétaire</div>
                  <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                    {moneyPretty(walletTotal, walletCurrency)}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    En attente / Disponible / Payé (payout)
                    <span className="ml-2 opacity-70">
                      · net indicatif ≈ {Math.round(OWNER_NET_PERCENT * 100)}% (commission {Math.round(PLATFORM_FEE_PERCENT * 100)}%)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={UI.chip}>
                    Ce mois: <b className="ml-1">{moneyPretty(statsFallback.monthGross * OWNER_NET_PERCENT, walletCurrency)}</b>
                  </span>
                  <span className={UI.chip}>
                    Réservations payées: <b className="ml-1">{statsFallback.paidCount}</b>
                  </span>
                </div>
              </div>

              {walletErr ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800">
                  {walletErr}
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
                  <div className="text-xs text-slate-500">En attente</div>
                  <div className="font-semibold">{moneyPretty(walletPending, walletCurrency)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
                  <div className="text-xs text-slate-500">Disponible</div>
                  <div className="font-semibold">{moneyPretty(walletAvailable, walletCurrency)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
                  <div className="text-xs text-slate-500">Payé</div>
                  <div className="font-semibold">{moneyPretty(walletPaidOut, walletCurrency)}</div>
                </div>
              </div>

              {/* Graphique mensuel */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-slate-800">Gains mensuels (12 mois)</div>
                  <div className={UI.subtle}>{(monthly?.currency ?? walletCurrency).toUpperCase()}</div>
                </div>

                {monthlyErr ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800">
                    {monthlyErr}
                  </div>
                ) : !monthly || monthly.items.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-sm text-slate-700">
                    Pas encore de gains à afficher.
                  </div>
                ) : (
                  <div className="grid grid-cols-12 gap-2 items-end h-28">
                    {(() => {
                      const max = Math.max(...monthly.items.map((x) => x.total), 1);
                      return monthly.items.map((x) => {
                        const h = Math.round((x.total / max) * 100);
                        return (
                          <div key={x.month} className="col-span-3 sm:col-span-1 flex flex-col items-center gap-1">
                            <div className="w-full rounded-xl border border-slate-200/70 bg-white/70 overflow-hidden h-24 flex items-end">
                              <div className="w-full bg-violet-600/60" style={{ height: `${h}%` }} />
                            </div>
                            <div className="text-[10px] text-slate-500">{x.month.slice(5)}</div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
            <div className="text-sm text-slate-700 font-medium">Filtrer</div>
            <div className="flex flex-col gap-2">
              <button type="button" className={tabBtnClass(tab === "upcoming")} onClick={() => setTab("upcoming")}>
                À venir <span className="opacity-70">({upcoming.length})</span>
              </button>
              <button type="button" className={tabBtnClass(tab === "past")} onClick={() => setTab("past")}>
                Passées <span className="opacity-70">({past.length})</span>
              </button>
              <button type="button" className={tabBtnClass(tab === "cancelled")} onClick={() => setTab("cancelled")}>
                Annulées <span className="opacity-70">({cancelled.length})</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-slate-700 font-medium">{tabTitle}</span>
              <span className={UI.subtle}>{visibleRows.length} réservation(s)</span>
            </div>
          </div>
        </div>

        {err ? (
          <div className={`${Card} border-rose-200`}>
            <p className="text-sm text-rose-700">Erreur : {err}</p>
          </div>
        ) : null}

        {loading ? (
          <div className={Card}>
            <p className={UI.p}>Chargement…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className={Card}>
            <p className={UI.p}>Aucune réservation pour le moment.</p>
          </div>
        ) : (
          <>
            {/* ✅ 1 seule liste affichée selon l’onglet */}
            {tab === "upcoming" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleRows.map((b) => {
                  const p = getParkingFromJoin(b.parkings);
                  const photos = parsePhotos(p?.photos ?? null);
                  const photo = firstPhotoUrl(photos);

                  const chatAllowed = canChat(b, nowMs);
                  const cancelAllowed = canCancelOwner(b, nowMs);

                  return (
                    <div key={b.id} className={`${UI.card} ${UI.cardHover} overflow-hidden`}>
                      <div className="h-40 bg-slate-100">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                            Aucune photo
                          </div>
                        )}
                      </div>

                      <div className={UI.cardPad}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{p?.title ?? "Place"}</div>
                            <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                              {p?.address ?? "Adresse non renseignée"}
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 items-end text-[11px]">
                            <span className={UI.chip}>{b.status ?? "—"}</span>
                            <span className={UI.chip}>{b.payment_status ?? "—"}</span>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1 text-sm text-slate-700">
                          <div>
                            <span className="text-slate-500">Début :</span> <b>{formatDateTime(b.start_time)}</b>
                          </div>
                          <div>
                            <span className="text-slate-500">Fin :</span> <b>{formatDateTime(b.end_time)}</b>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-slate-500">Total</span>
                          <b className="text-slate-900">{money(b.total_price, b.currency)}</b>
                        </div>

                        <div className={`${UI.divider} my-4`} />

                        <div className="flex gap-2">
                          <Link href={`/parkings/${b.parking_id}`} className={`${UI.btnBase} ${UI.btnGhost} flex-1`}>
                            Voir la place
                          </Link>

                          <button
                            type="button"
                            className={`${UI.btnBase} ${UI.btnPrimary} flex-1`}
                            disabled={!chatAllowed || chatLoadingId === b.id}
                            onClick={() => void openChat(b.id)}
                            title={!chatAllowed ? "Chat désactivé (passée ou annulée)" : ""}
                          >
                            {chatLoadingId === b.id ? "…" : "Chat"}
                          </button>

                          <button
                            type="button"
                            className={`${UI.btnBase} ${UI.btnPrimary} flex-1`}
                            onClick={() => {
                              setErr(null);
                              setOpenBooking(b);
                            }}
                          >
                            Détails
                          </button>
                        </div>

                        {!cancelAllowed ? (
                          <div className="mt-3 text-xs text-slate-500">
                            Annulation désactivée (réservation passée ou annulée).
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleRows.map((b) => {
                  const p = getParkingFromJoin(b.parkings);
                  const photos = parsePhotos(p?.photos ?? null);
                  const photo = firstPhotoUrl(photos);

                  const chatAllowed = canChat(b, nowMs);
                  const rb = refundBadge(b);

                  return (
                    <div
                      key={b.id}
                      className="rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-16 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photo} alt="" className="w-full h-full object-cover" />
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{p?.title ?? "Place"}</div>
                          <div className="mt-1 text-xs text-slate-600 line-clamp-2">
                            {p?.address ?? "Adresse non renseignée"}
                          </div>

                          <div className="mt-2 text-sm text-slate-700">
                            <span className="text-slate-500">{tab === "cancelled" ? "Début :" : "Fin :"}</span>{" "}
                            <b>{tab === "cancelled" ? formatDateTime(b.start_time) : formatDateTime(b.end_time)}</b>
                          </div>

                          {isCancelled(b) ? (
                            <div className="mt-2 text-xs text-slate-600">
                              <b className="text-slate-900">Annulée</b>
                              {rb ? <span className="ml-2">· {rb.label}</span> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 justify-between sm:justify-end">
                        <div className="text-sm text-slate-700">
                          <div className="text-slate-500 text-xs">Total</div>
                          <div className="font-semibold">{money(b.total_price, b.currency)}</div>
                        </div>

                        <button
                          type="button"
                          className={`${UI.btnBase} ${UI.btnPrimary}`}
                          disabled={!chatAllowed || chatLoadingId === b.id}
                          onClick={() => void openChat(b.id)}
                          title={!chatAllowed ? "Chat désactivé (passée ou annulée)" : ""}
                        >
                          {chatLoadingId === b.id ? "…" : "Chat"}
                        </button>

                        <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => setOpenBooking(b)}>
                          Détails
                        </button>

                        <Link href={`/parkings/${b.parking_id}`} className={`${UI.btnBase} ${UI.btnPrimary}`}>
                          Voir la place
                        </Link>
                      </div>
                    </div>
                  );
                })}

                {visibleRows.length === 0 ? (
                  <div className={Card}>
                    <p className={UI.p}>Aucune réservation dans cet onglet.</p>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}

        {/* MODALE DETAILS */}
        {openBooking ? (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpenBooking(null)}
          >
            <div className={`${UI.card} ${UI.cardPad} w-full max-w-lg space-y-4`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900">Détails réservation (owner)</h2>
                  <p className={UI.subtle}>
                    ID : <span className="font-mono break-all">{openBooking.id}</span>
                  </p>
                </div>
                <button type="button" className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => setOpenBooking(null)}>
                  Fermer
                </button>
              </div>

              {(() => {
                const p = getParkingFromJoin(openBooking.parkings);
                const photos = parsePhotos(p?.photos ?? null);
                const photo = firstPhotoUrl(photos);

                const cancelledB = isCancelled(openBooking);
                const pastBooking = isPast(openBooking, nowMs);
                const chatAllowed = canChat(openBooking, nowMs);
                const cancelAllowed = canCancelOwner(openBooking, nowMs);

                const rb = refundBadge(openBooking);

                return (
                  <div className="space-y-3">
                    {photo ? (
                      <div className="h-44 rounded-2xl overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">{p?.title ?? "Place"}</div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={UI.chip}>{openBooking.status ?? "—"}</span>
                        <span className={UI.chip}>{openBooking.payment_status ?? "—"}</span>
                      </div>
                    </div>

                    {cancelledB ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">Réservation annulée</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {rb ? rb.label : "Statut remboursement indisponible"}
                          {openBooking.cancelled_by ? ` · par ${openBooking.cancelled_by}` : ""}
                          {openBooking.cancelled_at ? ` · ${formatDateTime(openBooking.cancelled_at)}` : ""}
                        </div>
                      </div>
                    ) : pastBooking ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">Réservation passée</div>
                        <div className="mt-1 text-xs text-slate-600">Chat et annulation désactivés.</div>
                      </div>
                    ) : null}

                    <div className="text-sm text-slate-700">
                      <div className="text-slate-500 text-xs">Adresse</div>
                      <div>{p?.address ?? "—"}</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
                      <div>
                        <div className="text-slate-500 text-xs">Début</div>
                        <div className="font-medium">{formatDateTime(openBooking.start_time)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs">Fin</div>
                        <div className="font-medium">{formatDateTime(openBooking.end_time)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Total</span>
                      <b className="text-slate-900">{money(openBooking.total_price, openBooking.currency)}</b>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Link
                        href={`/parkings/${openBooking.parking_id}`}
                        className={`${UI.btnBase} ${UI.btnPrimary} flex-1`}
                        onClick={() => setOpenBooking(null)}
                      >
                        Ouvrir la place
                      </Link>

                      <button
                        type="button"
                        className={`${UI.btnBase} ${UI.btnPrimary} flex-1`}
                        disabled={!chatAllowed || chatLoadingId === openBooking.id}
                        onClick={() => void openChat(openBooking.id)}
                        title={!chatAllowed ? "Chat désactivé (passée ou annulée)" : ""}
                      >
                        {chatLoadingId === openBooking.id ? "…" : "Chat"}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`${UI.btnBase} ${UI.btnDanger} flex-1`}
                        disabled={!cancelAllowed || !!cancelLoadingId}
                        onClick={() => openOwnerCancelModal(openBooking)}
                        title={!cancelAllowed ? "Annulation désactivée (passée ou annulée)" : ""}
                      >
                        {cancelLoadingId ? "Annulation…" : "Annuler"}
                      </button>
                    </div>

                    <div className="pt-2 text-xs text-slate-500">
                      Remarque : l’annulation propriétaire déclenche un remboursement automatique uniquement si la réservation est payée.
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
