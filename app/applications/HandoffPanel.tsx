"use client";

import { useCallback, useEffect, useState } from "react";

type Admin = {
  id: string;
  username: string;
  full_name: string | null;
  role: "super_admin" | "hr_officer" | "branch_manager";
  branch_id: string | null;
};

type Event = {
  id: string;
  type: string;
  detail: string | null;
  created_at: string;
  actor: { id: string; full_name: string | null; username: string } | null;
};

type Props = {
  applicationId: string;
  assignedTo: string | null;
  assigneeName: string | null;
  branchName: string | null;
  currentAdminId: string;
  transferStatus: string;
  transferOfferBranchName: string | null;
  onAssigned: (assignedTo: string | null) => void;
  onTransferOffered: () => void;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const EVENT_LABEL: Record<string, string> = {
  status: "Status changed",
  claim: "Claimed",
  assign: "Assigned",
  return: "Returned to pool",
  escalate: "Escalated",
  note: "Note added",
  transfer_response: "Branch transfer",
};

/** Claim / assign / return / escalate an application, and show its hand-off history. */
export default function HandoffPanel({
  applicationId,
  assignedTo,
  assigneeName,
  branchName,
  currentAdminId,
  transferStatus,
  transferOfferBranchName,
  onAssigned,
  onTransferOffered,
}: Props) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [targetAdminId, setTargetAdminId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/applications/events?applicationId=${encodeURIComponent(applicationId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load history.");
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    }
  }, [applicationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEvents();
    fetch("/api/admins")
      .then((r) => r.json())
      .then((data) => setAdmins(data.admins ?? []))
      .catch(() => setAdmins([]));
  }, [loadEvents]);

  async function act(action: "claim" | "assign" | "return" | "escalate") {
    setError("");
    setNotice("");
    setSaving(true);

    try {
      const response = await fetch("/api/applications/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: applicationId,
          action,
          targetAdminId: action === "assign" || action === "escalate" ? targetAdminId : undefined,
          note: note || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update the assignment.");

      if (data.transferPending) {
        onTransferOffered();
        setNotice("Transfer offer sent to the applicant — waiting for their response.");
      } else {
        onAssigned(data.assignedTo ?? null);
        setNotice(
          action === "claim"
            ? "You now own this application."
            : action === "return"
              ? "Returned to the unassigned pool."
              : action === "escalate"
                ? "Escalated."
                : "Reassigned."
        );
      }
      setNote("");
      setTargetAdminId("");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the assignment.");
    } finally {
      setSaving(false);
    }
  }

  const isMine = assignedTo === currentAdminId;
  const otherAdmins = admins.filter((a) => a.id !== currentAdminId);
  const superAdmins = admins.filter((a) => a.role === "super_admin" && a.id !== currentAdminId);

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900">Hand-off</h3>
      <p className="mt-1 text-sm text-slate-500">Claim, assign, return or escalate this application.</p>

      <div className="mt-4 border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-700">
          {assignedTo ? (
            <>
              Currently handled by <span className="font-semibold">{assigneeName ?? "an admin"}</span>
              {isMine && " (you)"}
            </>
          ) : (
            "Unassigned — in the shared HR queue."
          )}
          {branchName && (
            <>
              {" "}
              · Branch: <span className="font-semibold">{branchName}</span>
            </>
          )}
        </p>
      </div>

      {transferStatus === "pending" && (
        <div className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            Waiting for the applicant to accept or decline a transfer to MR.DIY {transferOfferBranchName ?? "another branch"}.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            The application stays with its current handler until the applicant responds in the app.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {!assignedTo && transferStatus !== "pending" && (
          <button
            type="button"
            disabled={saving}
            onClick={() => act("claim")}
            className="bg-[#e30613] px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Claim
          </button>
        )}

        {isMine && (
          <button
            type="button"
            disabled={saving}
            onClick={() => act("return")}
            className="border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613] disabled:opacity-50"
          >
            Return to pool
          </button>
        )}

        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assign / escalate to
            </label>
            <select
              value={targetAdminId}
              onChange={(e) => setTargetAdminId(e.target.value)}
              className="border border-slate-300 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#e30613]"
            >
              <option value="">Select admin…</option>
              {otherAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.username} ({a.role.replace("_", " ")})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={saving || !targetAdminId || transferStatus === "pending"}
            onClick={() => act("assign")}
            className="border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Assign
          </button>
          {superAdmins.length > 0 && (
            <button
              type="button"
              disabled={saving || !targetAdminId || transferStatus === "pending"}
              onClick={() => act("escalate")}
              className="border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Escalate
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Hand-off note (optional)"
          className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#e30613]"
        />
      </div>

      {error && <p className="mt-3 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}
      {notice && (
        <p className="mt-3 border border-green-200 bg-green-50 px-4 py-3 text-xs font-semibold text-green-700">{notice}</p>
      )}

      {events && events.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-800">History</h4>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            {events.map((event) => (
              <li key={event.id}>
                <span className="font-semibold">{EVENT_LABEL[event.type] ?? event.type}</span>
                {event.actor && <> by {event.actor.full_name || event.actor.username}</>}
                {event.detail && <>: {event.detail}</>} · {formatWhen(event.created_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
