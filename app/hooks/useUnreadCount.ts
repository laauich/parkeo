"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";

type Conv = {
  id: string;
  owner_id: string;
  client_id: string;
  last_message_at: string | null;
  last_read_owner_at: string | null;
  last_read_client_at: string | null;
};

export function useUnreadCount() {
  const { ready, session, supabase } = useAuth();
  const userId = session?.user?.id ?? null;

  const [count, setCount] = useState(0);

  const load = async () => {
    if (!userId) {
      setCount(0);
      return;
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id, owner_id, client_id, last_message_at, last_read_owner_at, last_read_client_at")
      .or(`owner_id.eq.${userId},client_id.eq.${userId}`)
      .limit(200);

    if (error) {
      setCount(0);
      return;
    }

    const rows = (data ?? []) as Conv[];
    const unread = rows.filter((c) => {
      if (!c.last_message_at) return false;
      const lm = new Date(c.last_message_at).getTime();
      const isOwner = c.owner_id === userId;
      const lr = isOwner ? c.last_read_owner_at : c.last_read_client_at;
      const lrMs = lr ? new Date(lr).getTime() : 0;
      return lm > lrMs;
    }).length;

    setCount(unread);
  };

  useEffect(() => {
    if (!ready) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  // realtime update count
  useEffect(() => {
    if (!session) return;

    const ch = supabase
      .channel("unread-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, session?.user?.id]);

  const badge = useMemo(() => (count > 99 ? "99+" : String(count)), [count]);

  return { unreadCount: count, badge };
}
