"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type ParkingMini = {
  title: string | null;
  address: string | null;
};

type ConversationRow = {
  id: string;
  booking_id: string | null;
  parking_id: string | null;
  owner_id: string;
  client_id: string;
  created_at: string | null;
  last_message_at: string | null;
  parkings?: ParkingMini[] | ParkingMini | null; // join parfois array
};

type MessageRow = {
  id: string;
  conversation_id: string;
  body: string;
  sender_id: string;
  created_at: string;
};

function getParkingFromJoin(join: ConversationRow["parkings"]): ParkingMini | null {
  if (!join) return null;
  if (Array.isArray(join)) return join[0] ?? null;
  return join;
}

function fmtShort(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  const { ready, session, supabase } = useAuth();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [lastByConv, setLastByConv] = useState<Record<string, MessageRow | null>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!userId) {
      setRows([]);
      setLastByConv({});
      setLoading(false);
      return;
    }

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
        parkings:parking_id ( title, address )
      `
      )
      .or(`owner_id.eq.${userId},client_id.eq.${userId}`)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLastByConv({});
      setLoading(false);
      return;
    }

    const convs = (data ?? []) as unknown as ConversationRow[];
    setRows(convs);

    // last message preview (simple)
    const ids = convs.map((c) => c.id);
    if (ids.length === 0) {
      setLastByConv({});
      setLoading(false);
      return;
    }

    const { data: msgs, error: mErr } = await supabase
      .from("messages")
      .select("id,conversation_id,body,sender_id,created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(200);

    if (mErr) {
      // si table pas créée/RLS pas ok, on ne bloque pas la page
      setLastByConv({});
      setLoading(false);
      return;
    }

    const map: Record<string, MessageRow | null> = {};
    for (const id of ids) map[id] = null;
    for (const m of (msgs ?? []) as MessageRow[]) {
      if (!map[m.conversation_id]) map[m.conversation_id] = m;
    }
    setLastByConv(map);

    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  const title = useMemo(() => {
    if (!session) return "Messages";
    return "Messages";
  }, [session]);

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
            <div>
              <h1 className={UI.h1}>{title}</h1>
              <p className={UI.p}>Connecte-toi pour accéder à tes conversations.</p>
            </div>
            <Link href="/login" className={`${UI.btnBase} ${UI.btnPrimary}`}>
              Se connecter
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <div className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>{title}</h1>
            <p className={UI.p}>Tes conversations avec propriétaires / clients.</p>
          </div>

          <div className="flex gap-2">
            <button className={`${UI.btnBase} ${UI.btnGhost}`} onClick={load} disabled={loading}>
              {loading ? "…" : "Rafraîchir"}
            </button>
            <Link href="/map" className={`${UI.btnBase} ${UI.btnPrimary}`}>
              Voir la carte
            </Link>
          </div>
        </div>

        {err ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className="text-sm text-rose-700">Erreur : {err}</p>
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
              Les chats apparaissent automatiquement quand tu cliques sur “Chat” depuis une réservation.
            </p>
            <Link href="/my-bookings" className={`${UI.btnBase} ${UI.btnPrimary}`}>
              Voir mes réservations
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map((c) => {
              const p = getParkingFromJoin(c.parkings);
              const last = lastByConv[c.id];
              const isOwner = userId === c.owner_id;

              return (
                <Link
                  key={c.id}
                  href={`/messages/${c.id}`}
                  className={`${UI.card} ${UI.cardHover} ${UI.cardPad} block`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {p?.title ?? "Conversation"}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 truncate">
                        {p?.address ?? (c.parking_id ? `Parking: ${c.parking_id}` : "—")}
                      </div>

                      <div className="mt-3 text-sm text-slate-700 line-clamp-2">
                        {last?.body ? last.body : "Aucun message pour l’instant."}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={UI.chip}>
                          {isOwner ? "Owner" : "Client"}
                        </span>
                        {c.booking_id ? <span className={UI.chip}>Booking lié</span> : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs text-slate-500">
                        {fmtShort(c.last_message_at || c.created_at)}
                      </div>
                      <div className="mt-2 text-violet-700 text-sm font-semibold">
                        Ouvrir →
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
