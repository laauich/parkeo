// app/hooks/useUnreadCount.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";

type ConvRow = {
  id: string;
  owner_id: string;
  client_id: string;
  last_message_at: string | null;
  last_read_owner_at: string | null;
  last_read_client_at: string | null;
};

function isUnread(c: ConvRow, userId: string) {
  if (!c.last_message_at) return false;
  const lm = new Date(c.last_message_at).getTime();
  const isOwner = c.owner_id === userId;
  const lr = isOwner ? c.last_read_owner_at : c.last_read_client_at;
  const lrMs = lr ? new Date(lr).getTime() : 0;
  return lm > lrMs;
}

export function useUnreadCount() {
  const { ready, session, supabase } = useAuth();
  const userId = session?.user?.id ?? null;

  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // anti-spam reload
  const lastReloadRef = useRef<number>(0);
  const reloadTimerRef = useRef<number | null>(null);

  const badge = useMemo(() => (count > 99 ? "99+" : String(count)), [count]);

  const load = async () => {
    if (!userId) {
      setCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("conversations")
      .select("id,owner_id,client_id,last_message_at,last_read_owner_at,last_read_client_at")
      .or(`owner_id.eq.${userId},client_id.eq.${userId}`)
      .limit(500);

    if (error) {
      // en cas d’erreur : ne casse pas la navbar
      setCount(0);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ConvRow[];
    const n = rows.filter((c) => isUnread(c, userId)).length;

    setCount(n);
    setLoading(false);
  };

  // throttle : regroupe plusieurs événements realtime en 1 seul load
  const scheduleReload = () => {
    const now = Date.now();
    // si on vient de reload < 250ms, on retarde
    if (now - lastReloadRef.current < 250) {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        lastReloadRef.current = Date.now();
        void load();
      }, 260);
      return;
    }

    lastReloadRef.current = now;
    void load();
  };

  useEffect(() => {
    if (!ready) return;
    if (!session || !userId) {
      setLoading(false);
      setCount(0);
      return;
    }

    void load();

    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  // ✅ Realtime subscriptions
  useEffect(() => {
    if (!session || !userId) return;

    // 1) Insert messages -> last_message_at bouge via trigger
    const ch1 = supabase
      .channel("rt:unread:messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => scheduleReload()
      )
      .subscribe();

    // 2) Update conversations -> last_read_* ou last_message_at
    const ch2 = supabase
      .channel("rt:unread:conversations")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          // pas de filter possible sur OR facilement, donc on recharge + throttle
        },
        () => scheduleReload()
      )
      .subscribe();

    // 3) Broadcast local (quand on mark read dans le thread)
    const ch3 = supabase
      .channel("rt:unread:broadcast")
      .on("broadcast", { event: "unread_changed" }, () => scheduleReload())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  return {
    unreadCount: count,
    badge,
    loading,
    reload: load,
  };
}
