"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  job_id: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Thread = {
  applicantId: string;
  applicant: Profile | null;
  messages: MessageRow[];
  lastMessage: MessageRow;
  unreadCount: number;
};

export default function MessagesPage() {
  const router = useRouter();

  const [adminId, setAdminId] = useState("");
  const [allMessages, setAllMessages] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function loadMessages(isCancelled: () => boolean = () => false) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/messages");

      if (isCancelled()) return;

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong.");
      }

      const data = await response.json();

      if (isCancelled()) return;

      setAdminId(data.adminId);
      setAllMessages((data.messages ?? []) as MessageRow[]);

      const profileMap: Record<string, Profile> = {};
      (data.profiles ?? []).forEach((profile: Profile) => {
        profileMap[profile.id] = profile;
      });
      setProfiles(profileMap);
    } catch (err) {
      if (!isCancelled()) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const threads = useMemo<Thread[]>(() => {
    if (!adminId) return [];

    const grouped = new Map<string, MessageRow[]>();

    allMessages.forEach((message) => {
      const applicantId = message.sender_id === adminId ? message.receiver_id : message.sender_id;
      const existing = grouped.get(applicantId) ?? [];
      existing.push(message);
      grouped.set(applicantId, existing);
    });

    const result: Thread[] = [];

    grouped.forEach((messages, applicantId) => {
      const sorted = [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      result.push({
        applicantId,
        applicant: profiles[applicantId] ?? null,
        messages: sorted,
        lastMessage: sorted[sorted.length - 1],
        unreadCount: sorted.filter((m) => m.receiver_id === adminId && !m.is_read).length,
      });
    });

    return result.sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );
  }, [allMessages, profiles, adminId]);

  const selectedThread = threads.find((thread) => thread.applicantId === selectedApplicantId) ?? null;

  async function openThread(applicantId: string) {
    setSelectedApplicantId(applicantId);

    const unread = allMessages.filter(
      (m) => m.sender_id === applicantId && m.receiver_id === adminId && !m.is_read
    );

    if (unread.length === 0) return;

    const response = await fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unread.map((m) => m.id) }),
    });

    if (response.ok) {
      setAllMessages((current) =>
        current.map((m) => (unread.some((u) => u.id === m.id) ? { ...m, is_read: true } : m))
      );
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();

    if (!selectedThread || !reply.trim()) return;

    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: selectedThread.applicantId,
          jobId: selectedThread.lastMessage.job_id,
          text: reply.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to send message.");
      }

      setAllMessages((current) => [...current, data.message as MessageRow]);
      setReply("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function formatTime(date: string) {
    try {
      return new Date(date).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      {/* SIDEBAR */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-60 bg-[#e30613] text-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center border-b border-white/15 px-6">
          <div className="flex h-14 w-44 items-center overflow-hidden">
            <img src="/logo.png" alt="MR.DIY" className="h-full w-full object-contain" />
          </div>
        </div>

        <nav className="flex-1 px-3 py-6">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Main Menu
          </p>

          <Link
            href="/dashboard"
            className="flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10"
          >
            Dashboard
          </Link>

          <Link
            href="/jobs"
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10"
          >
            Jobs
          </Link>

          <Link
            href="/applications"
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10"
          >
            Applications
          </Link>

          <Link
            href="/messages"
            className="mt-1 flex w-full border-l-4 border-white bg-white/15 px-6 py-3 text-left text-sm font-semibold"
          >
            Messages
          </Link>
        </nav>

        <div className="border-t border-white/15 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-6 py-3 text-left text-sm font-medium hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="lg:ml-60">
        <header className="sticky top-0 z-10 flex min-h-20 items-center border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Messages</h1>
          </div>
        </header>

        <div className="p-5 sm:p-6 lg:p-8">
          <section className="mb-6 border-b border-slate-200 pb-6">
            <p className="text-sm text-slate-500">
              Conversations between the recruitment team and applicants.
            </p>
          </section>

          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center border border-slate-200 bg-white">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
                <p className="mt-4 text-sm text-slate-500">Loading messages...</p>
              </div>
            </div>
          ) : threads.length === 0 ? (
            <div className="border border-slate-200 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl">
                💬
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-800">No conversations yet</h3>
              <p className="mt-1 text-sm text-slate-500">
                Messages sent to applicants (e.g. when updating application status) will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              {/* THREAD LIST */}
              <section className="h-fit border border-slate-200 bg-white shadow-sm">
                {threads.map((thread) => (
                  <button
                    key={thread.applicantId}
                    type="button"
                    onClick={() => openThread(thread.applicantId)}
                    className={`block w-full border-b border-slate-100 px-5 py-4 text-left last:border-0 hover:bg-slate-50 ${
                      thread.applicantId === selectedApplicantId ? "bg-red-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">
                        {thread.applicant?.full_name || "Name not available"}
                      </p>
                      {thread.unreadCount > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e30613] px-1.5 text-[10px] font-bold text-white">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {thread.lastMessage.sender_id === adminId ? "You: " : ""}
                      {thread.lastMessage.body}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatTime(thread.lastMessage.created_at)}
                    </p>
                  </button>
                ))}
              </section>

              {/* THREAD DETAIL */}
              <section className="flex min-h-[500px] flex-col border border-slate-200 bg-white shadow-sm">
                {!selectedThread ? (
                  <div className="flex flex-1 items-center justify-center p-10 text-center">
                    <p className="text-sm text-slate-500">
                      Select a conversation to view the full message thread.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-slate-200 px-6 py-4">
                      <p className="text-sm font-bold text-slate-900">
                        {selectedThread.applicant?.full_name || "Name not available"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {selectedThread.applicant?.email || "No email"}
                      </p>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
                      {selectedThread.messages.map((message) => {
                        const fromAdmin = message.sender_id === adminId;
                        return (
                          <div
                            key={message.id}
                            className={`flex ${fromAdmin ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[75%] px-4 py-3 text-sm ${
                                fromAdmin
                                  ? "bg-[#e30613] text-white"
                                  : "border border-slate-200 bg-slate-50 text-slate-700"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{message.body}</p>
                              <p
                                className={`mt-1 text-[10px] ${
                                  fromAdmin ? "text-white/70" : "text-slate-400"
                                }`}
                              >
                                {formatTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form
                      onSubmit={sendReply}
                      className="flex gap-2 border-t border-slate-200 px-6 py-4"
                    >
                      <input
                        type="text"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Type a reply..."
                        className="flex-1 border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#e30613]"
                      />
                      <button
                        type="submit"
                        disabled={sending || !reply.trim()}
                        className="bg-[#e30613] px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </form>
                  </>
                )}
              </section>
            </div>
          )}

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-400">MR.DIY Careers Administration</p>
          </footer>
        </div>
      </div>
    </main>
  );
}
