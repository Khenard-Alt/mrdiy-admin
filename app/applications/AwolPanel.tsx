"use client";

import { FormEvent, useState } from "react";

type Props = {
  applicationId: string;
  absenceSince: string | null;
  notice1SentAt: string | null;
  explanationDeadline: string | null;
  explanationReceivedAt: string | null;
  explanationText: string | null;
  onStatusChange: (status: string) => void;
  onCleared: () => void;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 5);
  return date.toISOString().slice(0, 10);
}

/**
 * The AWOL/abandonment twin-notice process (ADMIN_MAJOR_PLAN.md §Q). Abandonment
 * is never automatic under Philippine labor law — this walks through the same
 * return-to-work notice, explanation window, and termination notice a real HR
 * team has to go through before "Terminated" can be set.
 */
export default function AwolPanel({
  applicationId,
  absenceSince,
  notice1SentAt,
  explanationDeadline,
  explanationReceivedAt,
  explanationText,
  onStatusChange,
  onCleared,
}: Props) {
  const [absenceDate, setAbsenceDate] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [explanation, setExplanation] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const [lastDayWorked, setLastDayWorked] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function act(action: "notice1" | "explanation" | "reinstate" | "terminate", extra: Record<string, unknown> = {}) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/applications/awol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, action, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update the AWOL process.");

      if (action === "reinstate") {
        setNotice("Closed — not treated as abandonment. Employee stays Hired.");
        onCleared();
      } else if (action === "terminate") {
        onStatusChange("Terminated");
      } else {
        onCleared();
      }
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the AWOL process.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function submitNotice1(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!absenceDate) return;
    await act("notice1", { absenceSince: absenceDate, explanationDeadline: deadline });
  }

  async function submitExplanation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await act("explanation", { explanationText: explanation });
    setExplanation("");
  }

  async function submitTermination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!terminationReason.trim()) return;
    await act("terminate", { terminationReason, lastDayWorked: lastDayWorked || undefined });
  }

  const inputClass = "w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e30613]";

  return (
    <section className="mt-6 border border-rose-200 p-6">
      <h3 className="text-lg font-bold text-slate-900">AWOL / Abandonment</h3>
      <p className="mt-1 text-sm text-slate-500">
        Only use this for unexplained absence. Due process is required — abandonment is never automatic under
        Philippine labor law (Aliten v. U-Need Lumber, G.R. 168931).
      </p>

      {!notice1SentAt ? (
        <form onSubmit={submitNotice1} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              First unexplained absence
            </label>
            <input
              type="date"
              required
              value={absenceDate}
              onChange={(event) => setAbsenceDate(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Explanation deadline
            </label>
            <input
              type="date"
              required
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#e30613] px-5 py-3 text-sm font-semibold text-white hover:bg-[#c80511] disabled:opacity-50"
            >
              {saving ? "Sending…" : "Send return-to-work notice"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p>
              Return-to-work notice sent <strong>{formatDate(notice1SentAt)}</strong>. Unexplained absence since{" "}
              <strong>{formatDate(absenceSince)}</strong>. Explanation due <strong>{formatDate(explanationDeadline)}</strong>.
            </p>
          </div>

          {explanationReceivedAt ? (
            <div className="border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <p className="font-semibold">Explanation received {formatDate(explanationReceivedAt)}:</p>
              <p className="mt-1">{explanationText || "(no written explanation given)"}</p>
            </div>
          ) : (
            <form onSubmit={submitExplanation} className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Record explanation (if the employee responded)
              </label>
              <textarea
                rows={3}
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                placeholder="What the employee said, or leave blank if they did not respond by the deadline"
                className={`${inputClass} resize-none`}
              />
              <button
                type="submit"
                disabled={saving}
                className="border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613] disabled:opacity-50"
              >
                Save explanation
              </button>
            </form>
          )}

          <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-bold text-slate-800">Not abandonment</h4>
              <p className="mt-1 text-xs text-slate-500">
                The explanation was valid, or the employee returned to work. Close this process.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => act("reinstate")}
                className="mt-3 border border-green-300 bg-white px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                Reinstate — not abandonment
              </button>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-800">Confirm termination</h4>
              <form onSubmit={submitTermination} className="mt-1 space-y-2">
                <textarea
                  rows={2}
                  required
                  value={terminationReason}
                  onChange={(event) => setTerminationReason(event.target.value)}
                  placeholder="Reason for termination (required)"
                  className={`${inputClass} resize-none`}
                />
                <input
                  type="date"
                  value={lastDayWorked}
                  onChange={(event) => setLastDayWorked(event.target.value)}
                  placeholder="Last day actually worked (optional)"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                >
                  Confirm termination
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}
      {notice && (
        <p className="mt-4 border border-green-200 bg-green-50 px-4 py-3 text-xs font-semibold text-green-700">{notice}</p>
      )}
    </section>
  );
}
