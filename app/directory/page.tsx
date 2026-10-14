"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminAlertsBell from "@/components/AdminAlertsBell";
import Sidebar from "@/components/Sidebar";
import { statusClasses, STATUS_VALUES } from "@/lib/pipeline";

type Person = {
  userId: string;
  latestApplicationId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  latestJobTitle: string | null;
  latestBranchName: string | null;
  latestStatus: string;
  latestStatusLabel: string;
  latestAppliedAt: string;
  applicationCount: number;
};

type Branch = { id: string; name: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function ApplicantDirectoryPage() {
  const router = useRouter();

  const [people, setPeople] = useState<Person[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/branches")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setBranches(data?.branches ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (search.trim()) params.set("search", search.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (branchFilter) params.set("branchId", branchFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const response = await fetch(`/api/directory?${params.toString()}`);

        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (response.status === 403) {
          router.push("/dashboard");
          return;
        }
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load the applicant directory.");
        }

        const data = await response.json();
        if (!cancelled) {
          setPeople(data.people ?? []);
          setTotal(data.total ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, search, statusFilter, branchFilter, dateFrom, dateTo, router]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Any filter change resets back to page 1 — a stale page number from a
  // narrower result set would otherwise show an empty page.
  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <Sidebar active="/directory" />

      <div className="pt-14 lg:ml-60 lg:pt-0">
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Applicant Directory
            </h1>
          </div>
          <AdminAlertsBell />
        </header>

        <div className="p-5 sm:p-6 lg:p-8">
          <section className="mb-6 border-b border-slate-200 pb-6">
            <p className="text-sm text-slate-500">
              Everyone who has ever applied to MR.DIY, company-wide — one row per person, showing their
              most recent application. Click a row to see their full history.
            </p>
          </section>

          {error && (
            <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* FILTERS */}
          <section className="mb-5 flex flex-wrap items-end gap-3 border border-slate-200 bg-white p-4">
            <div className="min-w-[200px] flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Search</label>
              <input
                type="text"
                value={search}
                onChange={(event) => updateFilter(setSearch, event.target.value)}
                placeholder="Name, email or phone…"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => updateFilter(setStatusFilter, event.target.value)}
                className="mt-1 border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                {STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Branch</label>
              <select
                value={branchFilter}
                onChange={(event) => updateFilter(setBranchFilter, event.target.value)}
                className="mt-1 border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Applied from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => updateFilter(setDateFrom, event.target.value)}
                className="mt-1 border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Applied to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => updateFilter(setDateTo, event.target.value)}
                className="mt-1 border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {(search || statusFilter || branchFilter || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setBranchFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
                className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-[#e30613] hover:text-[#e30613]"
              >
                Clear filters
              </button>
            )}
          </section>

          {/* TABLE */}
          <section className="border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Applicant</th>
                    <th className="px-5 py-3">Latest Position</th>
                    <th className="px-5 py-3">Branch</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Applications</th>
                    <th className="px-5 py-3">Last Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : people.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                        No applicants match these filters.
                      </td>
                    </tr>
                  ) : (
                    people.map((person) => (
                      <tr key={person.userId} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <Link
                            href={`/applications?open=${encodeURIComponent(person.latestApplicationId)}`}
                            className="text-sm font-bold text-slate-900 hover:text-[#e30613]"
                          >
                            {person.fullName || "Name not available"}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">{person.email || "No email"}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{person.latestJobTitle || "—"}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{person.latestBranchName || "—"}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(person.latestStatus)}`}
                          >
                            {person.latestStatusLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {person.applicationCount}
                          {person.applicationCount > 1 && (
                            <span className="ml-1 text-xs text-slate-400">applications</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{formatDate(person.latestAppliedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row">
              <p className="text-xs text-slate-500">
                {total === 0 ? "0 results" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
