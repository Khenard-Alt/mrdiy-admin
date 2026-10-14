"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeStatus, statusClasses } from "@/lib/pipeline";

type HistoryEntry = {
  id: string;
  jobTitle: string | null;
  branchName: string | null;
  status: string;
  statusLabel: string;
  appliedAt: string;
  updatedAt: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  resignationDate: string | null;
  lastWorkingDay: string | null;
  actualLastDay: string | null;
  terminationReason: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

type Props = {
  userId: string;
  /** The application currently open in the modal, so it can be marked "Currently viewing" in the list. */
  currentApplicationId: string;
};

/**
 * Every application this person has ever submitted to MR.DIY, across every branch and job —
 * "has this applicant worked here before, and where" (ADMIN_MAJOR_PLAN.md §U2/§U3). The API
 * scopes this to the viewer's own branch for a branch manager, company-wide for HR/super_admin —
 * nothing extra to filter here.
 */
export default function EmploymentHistoryPanel({ userId, currentApplicationId }: Props) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/applications/history?userId=${encodeURIComponent(userId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load employment history.");
      setHistory(data.history ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load employment history.");
      setHistory([]);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // A single application (this one) isn't a "history" worth showing on its own.
  if (history !== null && history.length <= 1 && !error) return null;

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900">Employment history</h3>
      <p className="mt-1 text-sm text-slate-500">
        Every application this person has submitted to MR.DIY, so you can see if they&apos;ve worked here before
        and where.
      </p>

      {history === null && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {error && <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}

      {history && history.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100 border border-slate-200">
          {history.map((entry) => {
            const isCurrent = entry.id === currentApplicationId;
            const ended = ["Resigned", "Terminated", "Contract Ended"].includes(normalizeStatus(entry.status));
            return (
              <li key={entry.id} className={`p-4 ${isCurrent ? "bg-slate-50" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {entry.jobTitle ?? "—"}
                      {entry.branchName && <span className="font-normal text-slate-500"> · {entry.branchName}</span>}
                      {isCurrent && (
                        <span className="ml-2 text-[11px] font-semibold text-slate-400">(currently viewing)</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Applied {formatDate(entry.appliedAt)}</p>
                  </div>
                  <span className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(entry.status)}`}>
                    {entry.statusLabel}
                  </span>
                </div>

                {ended && (
                  <p className="mt-2 text-xs text-slate-500">
                    {entry.resignationDate && `Resigned ${formatDate(entry.resignationDate)}. `}
                    {entry.actualLastDay
                      ? `Last day worked: ${formatDate(entry.actualLastDay)}. `
                      : entry.lastWorkingDay && `Expected last day: ${formatDate(entry.lastWorkingDay)}. `}
                    {entry.terminationReason && `Reason: ${entry.terminationReason}`}
                  </p>
                )}
                {entry.contractStartDate && entry.contractEndDate && (
                  <p className="mt-2 text-xs text-slate-500">
                    Contract: {formatDate(entry.contractStartDate)} – {formatDate(entry.contractEndDate)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
