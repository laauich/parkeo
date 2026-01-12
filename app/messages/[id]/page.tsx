"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type ConversationRow = {
  id: string;
  booking_id: string | null;
  parking_id: string | null;
  owner_id: string;
  client_id: string;
  created_at: string | null;
  parkings?: { title: string | null; address: string | null }[] | { title: string | null; address: string | null } | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function getParkingFromJoin(join: ConversationRow["parkings"]) {
  if (!join) return null;
  if (Array.isArray(join)) return join[0] ?? null;
  return join;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

export default function MessageThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, session, supabase } = useAuth();
  const userId = session?.user?.id ?? null;

  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  const isAllowed = useMemo(() => {
    if (!conv || !userId) return false;
    return conv.owner_id === userId || conv.client_id === userId;
  }, [conv, userId]);

  const load = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    const { data: c, error: cErr } = await supabase
      .from("conversations")
      .select(
        `
        id,
        booking_id,
        parking_id,
        owner_id,
        client_id,
        created_at,
        parkings:parking_id ( title, address )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (cErr) {
      setErr(cErr.message);
      setConv(null);
      setRows([]);
      setLoading(false);
      return;
    }

    if (!c) {
      setErr("Conversation introuvable.");
      setConv(null);
      setRows([]);
      setLoading(false);
      return;
    }

    setConv(c as unknown as ConversationRow);

    const { data: m, error: mErr } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (mErr) {
      setErr(mErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((m ?? []) as MessageRow[]);
    setLoading(false);

    // scroll après render
    setTimeout(scrollToBottom, 50);
  };

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session?.user?.id, id]);

  // Realtime: new messages
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const msg = payload.new as MessageRow;
          setRows((prev) => {
            if (prev.some((x) => x.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(scrollToBottom, 50);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, id, session]);

  const send = async () => {
    if (!session || !userId) return;
    const body = text.trim();
    if (!body) return;

    setSending(true);
    setErr(null);

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: id,
        sender_id: userId,
        body,
      });

      if (error) {
        setErr(error.message);
        setSending(false);
        return;
      }

      setText("");
      // le realtime va ajouter le message, mais on scroll aussi
      setTimeout(scrollToBottom, 50);
      setSending(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erreur envoi");
      setSending(false);
    }
  };

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
            <h1 className={UI.h1}>Chat</h1>
            <p className={UI.p}>Connecte-toi pour accéder aux messages.</p>
            <Link href="/login" className={`${UI.btnBase} ${UI.btnPrimary}`}>
              Se connecter
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const parking = getParkingFromJoin(conv?.parkings ?? null);

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-4`}>
        <header className={UI.sectionTitleRow}>
          <div className="space-y-1">
            <h1 className={UI.h2}>Chat</h1>
            <p className={UI.p}>
              {parking?.title ? <b className="text-slate-900">{parking.title}</b> : "Conversation"}
              {parking?.address ? <span className="text-slate-500"> — {parking.address}</span> : null}
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/messages" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Messages
            </Link>
            {conv?.booking_id ? (
              <Link href="/my-bookings" className={`${UI.btnBase} ${UI.btnGhost}`}>
                Réservations
              </Link>
            ) : null}
          </div>
        </header>

        {err ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className="text-sm text-rose-700">Erreur : {err}</p>
          </div>
        ) : null}

        {loading ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        ) : !conv ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Conversation introuvable.</p>
          </div>
        ) : !isAllowed ? (
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Accès refusé.</p>
          </div>
        ) : (
          <>
            {/* Messages */}
            <section className={`${UI.card} overflow-hidden`}>
              <div className="h-[60vh] overflow-auto p-4 space-y-3 bg-white/70">
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    Aucun message. Écris le premier 🙂
                  </p>
                ) : (
                  rows.map((m) => {
                    const mine = m.sender_id === userId;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={[
                            "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm border",
                            mine
                              ? "bg-violet-600 text-white border-violet-600"
                              : "bg-white text-slate-900 border-slate-200",
                          ].join(" ")}
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
                          <div className={`mt-1 text-[11px] ${mine ? "text-white/80" : "text-slate-500"}`}>
                            {fmtTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className={`${UI.divider}`} />

              <div className="p-4 flex gap-2">
                <input
                  className={UI.input}
                  placeholder="Écrire un message…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`${UI.btnBase} ${UI.btnPrimary}`}
                  onClick={send}
                  disabled={sending || !text.trim()}
                >
                  {sending ? "…" : "Envoyer"}
                </button>
              </div>
            </section>

            <p className={UI.subtle}>
              Astuce : Entrée pour envoyer (Shift+Entrée pour sauter une ligne).
            </p>
          </>
        )}
      </div>
    </main>
  );
}
