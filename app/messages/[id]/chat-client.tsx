// app/messages/[id]/chat-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ConversationRow = {
  id: string;
  booking_id: string;
  parking_id: string;
  owner_id: string;
  client_id: string;
  parkings?: { id: string; title: string; address: string | null }[] | { id: string; title: string; address: string | null } | null;
};

function getParking(join: ConversationRow["parkings"]) {
  if (!join) return null;
  return Array.isArray(join) ? (join[0] ?? null) : join;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatClient({ conversationId }: { conversationId: string }) {
  const { ready, session, supabase } = useAuth();
  const me = session?.user?.id ?? null;

  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");

  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const title = useMemo(() => {
    const p = getParking(conv?.parkings ?? null);
    return p?.title ?? "Conversation";
  }, [conv]);

  const load = async () => {
    if (!me) return;

    setLoading(true);
    setErr(null);

    // Load conversation meta (RLS protected)
    const { data: c, error: cErr } = await supabase
      .from("conversations")
      .select(
        `
        id,
        booking_id,
        parking_id,
        owner_id,
        client_id,
        parkings:parking_id ( id, title, address )
      `
      )
      .eq("id", conversationId)
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

    setConv(c as ConversationRow);

    // Load messages
    const { data: m, error: mErr } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (mErr) {
      setErr(mErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((m ?? []) as MessageRow[]);
    setLoading(false);

    // After render
    setTimeout(() => scrollToBottom(false), 0);
  };

  useEffect(() => {
    if (!ready) return;
    if (!session || !me) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me, conversationId]);

  // Realtime subscribe
  useEffect(() => {
    if (!session || !me) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as MessageRow;

          // Avoid duplicates (rare)
          setRows((prev) => {
            if (prev.some((x) => x.id === msg.id)) return prev;
            return [...prev, msg];
          });

          // Scroll after paint
          setTimeout(() => scrollToBottom(true), 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, me, session]);

  const send = async () => {
    if (!session || !me) return;
    const body = text.trim();
    if (!body) return;

    setSending(true);
    setErr(null);

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: me,
      body,
    });

    if (error) {
      setErr(error.message);
      setSending(false);
      return;
    }

    setText("");
    setSending(false);

    // Realtime will append; but we scroll anyway
    setTimeout(() => scrollToBottom(true), 0);
  };

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
          <h1 className={UI.h1}>Conversation</h1>
          <p className={UI.p}>Connecte-toi pour accéder au chat.</p>
        </div>
        <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/login">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`${UI.card} ${UI.cardPad} flex items-start justify-between gap-3`}>
        <div className="min-w-0">
          <h1 className={UI.h2}>{title}</h1>
          <p className={UI.subtle}>Conversation temps réel</p>
          {err ? <p className="mt-2 text-sm text-rose-700">Erreur : {err}</p> : null}
        </div>
        <div className="flex gap-2">
          <Link className={`${UI.btnBase} ${UI.btnGhost}`} href="/messages">
            Retour
          </Link>
          {conv?.parking_id ? (
            <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href={`/parkings/${conv.parking_id}`}>
              Ouvrir la place
            </Link>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div className={`${UI.card} overflow-hidden`}>
        <div
          ref={listRef}
          className="h-[60vh] sm:h-[65vh] overflow-y-auto p-4 space-y-3 bg-white/60"
        >
          {loading ? (
            <p className={UI.p}>Chargement…</p>
          ) : rows.length === 0 ? (
            <p className={UI.p}>Aucun message. Dis bonjour 👋</p>
          ) : (
            rows.map((m) => {
              const mine = m.sender_id === me;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={[
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm border",
                      mine
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-slate-900 border-slate-200/70",
                    ].join(" ")}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`mt-1 text-[10px] ${mine ? "text-white/80" : "text-slate-400"}`}>
                      {fmtTime(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <div className="p-3 border-t border-slate-200/70 bg-white/80">
          <div className="flex gap-2">
            <input
              className={UI.input}
              value={text}
              placeholder="Écrire un message…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={sending}
            />
            <button
              type="button"
              className={`${UI.btnBase} ${UI.btnPrimary}`}
              onClick={() => void send()}
              disabled={sending || !text.trim()}
            >
              {sending ? "…" : "Envoyer"}
            </button>
          </div>

          {/* Quick replies MVP */}
          <div className="mt-2 flex flex-wrap gap-2">
            {["Je suis arrivé ✅", "Où est l’entrée ?", "J’ai quitté la place 🚗", "Merci 🙏"].map((q) => (
              <button
                key={q}
                type="button"
                className={`${UI.btnBase} ${UI.btnGhost} px-3 py-2 text-xs rounded-full`}
                onClick={() => setText(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
