"use client";

import { useEffect, useState } from "react";

type JobOption = { id: string; title: string | null; location: string | null };

type Ranked = {
  rank: number;
  total: number;
  applicationId: string;
  name: string;
  location: string | null;
  statusLabel: string;
  finalScore: number;
  savedScore: number | null;
  textScore: number;
  distanceKm: number | null;
  strengths: string[];
  weaknesses: string[];
  explanation: string;
  hasResume: boolean;
};

function barColor(score: number) {
  if (score >= 70) return "bg-green-500";
  if (score >= 45) return "bg-yellow-400";
  return "bg-red-400";
}

/**
 * Ranks the applicants of one job from best to weakest match, with strengths, weaknesses and
 * a plain-language reason for each rank.
 */
export default function RankingPanel({ onOpen }: { onOpen: (applicationId: string) => void }) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobId, setJobId] = useState("");
  const [rows, setRows] = useState<Ranked[] | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then((response) => response.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setError("Could not load the jobs."));
  }, []);

  async function choose(id: string) {
    setJobId(id);
    setRows(null);
    setError("");
    setOpen(null);
    if (!id) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/ranking?jobId=${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not rank the applicants.");
      setRows(data.applicants ?? []);
      setJobTitle(data.job?.title ?? "");
      setOpen(data.applicants?.[0]?.applicationId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rank the applicants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6 border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Applicant ranking</h2>
          <p className="mt-1 text-xs text-slate-500">
            Pick a job to see its applicants from best to weakest match, with strengths, weaknesses and the reason for
            each rank.
          </p>
        </div>
        <select
          value={jobId}
          onChange={(event) => choose(event.target.value)}
          className="w-full border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#e30613] sm:max-w-sm"
        >
          <option value="">Choose a job…</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} {job.location ? `· ${job.location}` : ""}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-500">Reading resumes and ranking…</p>}
      {error && <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}
      {rows && rows.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">Nobody has applied for {jobTitle || "this job"} yet.</p>
      )}

      {rows && rows.length > 0 && (
        <ol className="mt-5 space-y-3">
          {rows.map((row) => {
            const expanded = open === row.applicationId;
            return (
              <li key={row.applicationId} className="border border-slate-200">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : row.applicationId)}
                  className="flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#e30613] text-base font-bold text-white">
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{row.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {row.location ?? "No location"} · {row.statusLabel}
                      {row.distanceKm !== null && ` · ~${Math.floor(row.distanceKm)} km from the branch`}
                    </span>
                  </span>
                  <span className="hidden w-40 sm:block">
                    <span className="block h-2.5 bg-slate-100">
                      <span className={`block h-full ${barColor(row.finalScore)}`} style={{ width: `${row.finalScore}%` }} />
                    </span>
                  </span>
                  <span className="w-14 shrink-0 text-right text-lg font-bold text-slate-900">{row.finalScore}%</span>
                </button>

                {expanded && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                    <p className="border-l-4 border-[#e30613] bg-white p-3 text-sm leading-6 text-slate-800">
                      {row.explanation}
                    </p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="border border-green-200 bg-green-50 p-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-green-800">Strengths</h4>
                        <ul className="mt-2 space-y-1">
                          {row.strengths.map((item) => (
                            <li key={item} className="flex gap-2 text-sm text-slate-800">
                              <span className="font-bold text-green-700">+</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="border border-red-200 bg-red-50 p-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-red-800">Weaknesses and gaps</h4>
                        <ul className="mt-2 space-y-1">
                          {row.weaknesses.map((item) => (
                            <li key={item} className="flex gap-2 text-sm text-slate-800">
                              <span className="font-bold text-red-700">−</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>Text match {row.textScore}%</span>
                      {row.savedScore !== null && <span>Saved when they applied: {row.savedScore}%</span>}
                      <button
                        type="button"
                        onClick={() => onOpen(row.applicationId)}
                        className="ml-auto border border-[#e30613] px-4 py-2 text-xs font-semibold text-[#e30613] hover:bg-red-50"
                      >
                        Open application
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
