"use client";

import { useEffect, useRef, useState } from "react";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type Alert = {
  id: string;
  type: string;
  title: string;
  message: string;
  application_id: string | null;
  is_read: boolean;
  created_at: string;
};

function formatWhen(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** The bell icon in the header: HR's own notifications (new applications, hand-offs, replies). */
export default function AdminAlertsBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const response = await fetch("/api/admin-alerts");
      if (!response.ok) return;
      const data = await response.json();
      setAlerts(data.alerts ?? []);
    } catch {
      // Best effort — the bell just stays at its last known state.
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Fallback poll in case the realtime connection drops; the broadcast
    // subscription below delivers near-instant updates in the normal case.
    const interval = setInterval(load, 5 * 60_000);
    return () => clearInterval(interval);
  }, []);

  useRealtimeRefresh(["admin_alerts"], load);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markAllRead() {
    setAlerts((current) => current.map((a) => ({ ...a, is_read: true })));
    await fetch("/api/admin-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-50"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e30613] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-[#e30613] hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">No notifications yet.</p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`border-b border-slate-100 px-4 py-3 last:border-0 ${alert.is_read ? "" : "bg-red-50/40"}`}
                >
                  <p className="text-xs font-bold text-slate-900">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{alert.message}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{formatWhen(alert.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
