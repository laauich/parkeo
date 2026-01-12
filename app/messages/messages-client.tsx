// app/messages/messages-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type ConversationRow = {
  id: string;
  booking_id: string;
  parking_id: string;
  owner_id: string;
  client_id: string;
  created_at: string;
  last_message_at: string | null;
  parkings?: { id: string; title: string; address: string | null }[] | { id: string; title: string; address: string | null } | null;
};

function getParking(join: ConversationRow["parkings"]) {
  if (!join) return null;
  return Array.isArray(join) ? (join[0] ?? null) : join;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MessagesClient() {
  const { ready, session, supabase } = useAuth();
  const me = session?.user?.id ?? null;

  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!me) return;
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("conversations")
      .select(
        `
        id,
        booking_id,
        parking_id,
        owner_id,
        client_id,
        created_at,
        last_message_at,
        parkings:parking_id ( id, title, address )
      `
      )
      .or(`owner_id.eq.${me},client_id.eq.${me}`)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ConversationRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    if (!me) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me]);

  const subtitle = useMemo(() => {
    if (!me) return "";
    return "Messages avec les propriétaires / locataires, liés à tes réservations.";
  }, [me]);

  if (!ready) {
    return (
      <div className={`${UI.card} ${UI.cardPad}`}>
        <p className={UI.p}>Chargement…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`${UI.card} ${UI.cardPad} space-y-4`}>
        <div>
          <h1 className={UI.h1}>Messages</h1>
          <p className={UI.p}>Connecte-toi pour accéder au chat.</p>
        </div>
        <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/login">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={UI.sectionTitleRow}>
        <div>
          <h1 className={UI.h1}>Messages</h1>
          <p className={UI.p}>{subtitle}</p>
        </div>

        <div className="flex gap-2">
          <button className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => void load()} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </button>
          <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/my-bookings">
            Mes réservations
          </Link>
        </div>
      </div>

      {err ? (
        <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
          <p className="text-sm text-rose-700">Erreur : {err}</p>
          <button className={`${UI.btnBase} ${UI.btnGhost}`} onClick={() => void load()}>
            Réessayer
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className={`${UI.card} ${UI.cardPad}`}>
          <p className={UI.p}>Chargement…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
          <h2 className={UI.h2}>Aucune conversation</h2>
          <p className={UI.p}>
            Une conversation est créée automatiquement à partir d’une réservation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/parkings">
              Trouver une place
            </Link>
            <Link className={`${UI.btnBase} ${UI.btnGhost}`} href="/my-bookings">
              Voir mes réservations
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((c) => {
            const p = getParking(c.parkings);
            const title = p?.title ?? "Conversation";
            const address = p?.address ?? "";
            const last = c.last_message_at ?? c.created_at;

            const role =
              me === c.owner_id ? "Owner" : me === c.client_id ? "Client" : "—";

            return (
              <Link
                key={c.id}
                href={`/messages/${c.id}`}
                className={[UI.card, UI.cardHover, "block"].join(" ")}
              >
                <div className={UI.cardPad}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {title}
                      </div>
                      {address ? (
                        <div className="mt-1 text-xs text-slate-500 line-clamp-2">
                          {address}
                        </div>
                      ) : null}
                    </div>

                    <span className={UI.chip}>{role}</span>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Dernier message : {fmt(last)}
                    </span>

                    <span className={`${UI.btnBase} ${UI.btnPrimary} px-3 py-2 text-xs rounded-full pointer-events-none`}>
                      Ouvrir →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
