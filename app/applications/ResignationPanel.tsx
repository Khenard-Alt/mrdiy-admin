"use client";

import { FormEvent, useState } from "react";

type Props = {
  applicationId: string;
  onResigned: (lastWorkingDay: string) => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Records a Hired applicant's voluntary resignation. Last working day defaults to
 * 30 days after the resignation date (Labor Code Art. 300) and is editable in
 * case the branch manager/HR accepted a shorter notice (ADMIN_MAJOR_PLAN.md §Q).
 */
export default function ResignationPanel({ applicationId, onResigned }: Props) {
  const [resignationDate, setResignationDate] = useState(todayISO());
  const [lastWorkingDay, setLastWorkingDay] = useState(addDays(todayISO(), 30));
  const [customDay, setCustomDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateResignationDate(value: string) {
    setResignationDate(value);
    if (!customDay) setLastWorkingDay(addDays(value, 30));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/applications/resign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, resignationDate, lastWorkingDay }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not record the resignation.");
      onResigned(data.lastWorkingDay);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the resignation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900">Record Resignation</h3>
      <p className="mt-1 text-sm text-slate-500">
        Philippine labor law defaults to a 30-day notice period. Only shorten the last working day if the employee
        and MR.DIY agreed to accept a shorter notice.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resignation date
          </label>
          <input
            type="date"
            required
            value={resignationDate}
            onChange={(event) => updateResignationDate(event.target.value)}
            className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e30613]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last working day
          </label>
          <input
            type="date"
            required
            value={lastWorkingDay}
            onChange={(event) => {
              setCustomDay(true);
              setLastWorkingDay(event.target.value);
            }}
            className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e30613]"
          />
          <p className="mt-1 text-xs text-slate-400">
            Defaults to 30 days after the resignation date. Edit only if a shorter notice was accepted.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#e30613] px-5 py-3 text-sm font-semibold text-white hover:bg-[#c80511] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Record Resignation"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-3 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>
      )}
    </section>
  );
}
