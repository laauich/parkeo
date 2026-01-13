// app/messages/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type ConvRow = {
  id: string;
  booking_id: string | null;
  parking_id: string | null;
  owner_id: string;
  client_id: string;
  last_message_at: string | null;
  last_read_owner_at: string | null;
  last_read_client_at: string | null;
  created_at: string | null;
  parkings?:
    | { title: string | null; address: string | null }[]
    | { title: string | null; address: string | null }
    | null;
};

function getParkingFromJoin(join: ConvRow["parkings"]) {
  if (!join) return null;
  if (Array.isArray(join)) return join[0] ?? null;
  return join;
}

function isUnread(c: ConvRow, userId: string) {
  if (!c.last_message_at) return false;
  const lm = new Date(c.last_message_at).getTime();
  const isOwner = c.owner_id === userId;
  const lr = isOwner ? c.last_read_owner_at : c.last_read_client_at;
  const lrMs = lr ? new Date(lr).getTime() : 0;
  return lm > lrMs;
}

export default function MessagesPage() {
  const { ready, session, supabase } = useAuth();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    // ✅ Centralise toute la logique loading ici (pas dans useEffect)
    if (!ready) return;

    // ✅ Pas connecté => état stable, sans setState dans l'effet
    if (!userId) {
      setRows([]);
      setErr(null);
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
        last_message_at,
        last_read_owner_at,
        last_read_client_at,
        created_at,
        parkings:parking_id ( title, address )
      `
      )
      .or(`owner_id.eq.${userId},client_id.eq.${userId}`)
      .order("last_message_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as unknown as ConvRow[]);
    setLoading(false);
  }, [ready, userId, supabase]);

  // ✅ initial load (aucun setState direct dans l'effet)
  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => void load());
  }, [ready, load]);

  // ✅ BroadcastChannel: maj instantanée (read/send) depuis d'autres pages
  useEffect(() => {
    if (!userId) return;

    const bc =
      typeof window !== "undefined"
        ? new BroadcastChannel("parkeo-unread")
        : null;

    const onMsg = () => {
      void load();
    };

    bc?.addEventListener("message", onMsg);

    return () => {
      bc?.removeEventListener("message", onMsg);
      bc?.close();
    };
  }, [userId, load]);

  // ✅ Realtime: nouveaux messages => reload list (simple et fiable MVP)
  useEffect(() => {
    if (!userId) return;

    const ch = supabase
      .channel(`messages-list:messages:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, userId, load]);

  // ✅ Realtime: conversations UPDATE/INSERT (read state + last_message_at)
  useEffect(() => {
    if (!userId) return;

    const chOwner = supabase
      .channel(`messages-list:conv-owner:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `owner_id=eq.${userId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    const chClient = supabase
      .channel(`messages-list:conv-client:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `client_id=eq.${userId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chOwner);
      void supabase.removeChannel(chClient);
    };
  }, [supabase, userId, load]);

  const unreadCount = useMemo(() => {
    if (!userId) return 0;
    return rows.filter((c) => isUnread(c, userId)).length;
  }, [rows, userId]);

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
            <h1 className={UI.h1}>Messages</h1>
            <p className={UI.p}>Connecte-toi pour accéder aux conversations.</p>
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
            <h1 className={UI.h1}>Messages</h1>
            <p className={UI.p}>
              Tes conversations ({rows.length}){" "}
              {unreadCount > 0 ? (
                <span className="text-slate-500">• {unreadCount} non lu(s)</span>
              ) : null}
            </p>
          </div>

          <button
            className={`${UI.btnBase} ${UI.btnGhost}`}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "…" : "Rafraîchir"}
          </button>
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
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Aucune conversation pour le moment.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map((c) => {
              const parking = getParkingFromJoin(c.parkings ?? null);
              const unread = userId ? isUnread(c, userId) : false;

              return (
                <Link
                  key={c.id}
                  href={`/messages/${c.id}`}
                  className={[UI.card, UI.cardPad, UI.cardHover, "block"].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {parking?.title ?? "Conversation"}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 truncate">
                        {parking?.address ?? "—"}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {unread ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-violet-600 text-white">
                          Non lu
                        </span>
                      ) : (
                        <span className={`${UI.chip} bg-slate-50`}>Lu</span>
                      )}
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
