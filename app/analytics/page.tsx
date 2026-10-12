"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAlertsBell from "@/components/AdminAlertsBell";
import Sidebar from "@/components/Sidebar";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type Analytics = {
  role?: "super_admin" | "hr_officer" | "branch_manager";
  funnel: { applied: number; shortlisted: number; interviewed: number; hired: number };
  byBranch: { branchId: string; branchName: string; applied: number; hired: number }[];
  byJob: { jobId: string; jobTitle: string; applied: number; hired: number }[];
  topJobs: { jobId: string; jobTitle: string; applied: number; hired: number }[];
  averageMatchScore: number | null;
  averageDaysToHire: number | null;
};

export default function AnalyticsPage() {
  const router = useRouter();

  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analytics");
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load analytics.");
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeRefresh(["applications"], load);

  const f = data?.funnel;
  const funnelMax = f ? Math.max(f.applied, 1) : 1;

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <Sidebar active="/analytics" />

      <div className="pt-14 lg:ml-60 lg:pt-0">
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">MR.DIY Careers</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Analytics</h1>
          </div>
          <AdminAlertsBell />
        </header>

        <div className="p-5 sm:p-6 lg:p-8">
          <section className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-slate-500">
              {data?.role === "branch_manager"
                ? "Recruitment funnel and per-job breakdown for your branch."
                : "Recruitment funnel, per-branch and per-job breakdown."}
            </p>
            <a
              href="/api/analytics?format=csv"
              className="bg-[#e30613] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#c80511]"
            >
              Export CSV
            </a>
          </section>

          {error && <div className="mb-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center border border-slate-200 bg-white">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* FUNNEL */}
              <section className="border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-bold text-slate-900">Funnel</h2>
                <div className="mt-5 space-y-3">
                  {([
                    ["Applied", f!.applied],
                    ["Shortlisted", f!.shortlisted],
                    ["Interviewed", f!.interviewed],
                    ["Hired", f!.hired],
                  ] as const).map(([label, value]) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold">{label}</span>
                        <span>{value}</span>
                      </div>
                      <div className="mt-1 h-3 w-full bg-slate-100">
                        <div
                          className="h-3 bg-[#e30613]"
                          style={{ width: `${Math.max(2, (value / funnelMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* SUMMARY CARDS */}
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Average Match Score</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {data.averageMatchScore !== null ? `${data.averageMatchScore}%` : "—"}
                  </p>
                </div>
                <div className="border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Average Days to Hire</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">
                    {data.averageDaysToHire !== null ? `${data.averageDaysToHire}d` : "—"}
                  </p>
                </div>
              </section>

              {/* BY BRANCH */}
              {data.byBranch.length > 0 && (
                <section className="border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <h2 className="text-base font-bold text-slate-900">By Branch</h2>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Applied</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Hired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byBranch.map((b) => (
                        <tr key={b.branchId} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-3 text-sm font-semibold text-slate-800">{b.branchName}</td>
                          <td className="px-5 py-3 text-sm text-slate-600">{b.applied}</td>
                          <td className="px-5 py-3 text-sm text-slate-600">{b.hired}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* TOP JOBS */}
              {data.topJobs.length > 0 && (
                <section className="border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <h2 className="text-base font-bold text-slate-900">Most Applied-To Jobs</h2>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Job</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Applied</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Hired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topJobs.map((j) => (
                        <tr key={j.jobId} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-3 text-sm font-semibold text-slate-800">{j.jobTitle}</td>
                          <td className="px-5 py-3 text-sm text-slate-600">{j.applied}</td>
                          <td className="px-5 py-3 text-sm text-slate-600">{j.hired}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </div>
          ) : null}

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-400">MR.DIY Careers Administration</p>
          </footer>
        </div>
      </div>
    </main>
  );
}
