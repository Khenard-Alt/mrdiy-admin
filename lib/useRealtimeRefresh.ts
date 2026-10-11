"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to the "admin-updates" Realtime Broadcast channel (see
 * 202610120007_realtime_broadcast.sql) and calls `onChange` whenever one of
 * `tables` changes on the server. The broadcast payload never contains row
 * data — just a "this table changed" signal — so `onChange` should refetch
 * through the normal authenticated /api routes, same as any manual reload.
 *
 * Debounced by 400ms so a burst of changes (e.g. a bulk status update)
 * triggers one refetch instead of many.
 */
export function useRealtimeRefresh(tables: string[], onChange: () => void) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin-updates");
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    tables.forEach((table) => {
      channel.on("broadcast", { event: table }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => onChangeRef.current(), 400);
      });
    });

    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(",")]);
}
