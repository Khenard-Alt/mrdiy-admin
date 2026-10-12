"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminAlertsBell from "@/components/AdminAlertsBell";
import Sidebar from "@/components/Sidebar";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type Employee = {
  applicationId: string;
  status: string;
  applicantName: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  jobTitle: string | null;
  isContractual: boolean;
  branchName: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  daysLeft: number | null;
  signed: boolean;
  signedAt: string | null;
  hiredAt: string | null;
  resignationDate: string | null;
  lastWorkingDay: string | null;
  actualLastDay: string | null;
  clearanceCompleted: boolean;
  finalPayReleased: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function daysLeftStyle(daysLeft: number | null) {
  if (daysLeft === null) return "border-slate-200 bg-slate-50 text-slate-600";
  if (daysLeft <= 14) return "border-red-200 bg-red-50 text-red-700";
  if (daysLeft <= 30) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-green-200 bg-green-50 text-green-700";
}

export default function EmployeesPage() {
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/employees");
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load employees.");
      }
      const data = await response.json();
      setEmployees(data.employees ?? []);
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

  const resigned = employees.filter((e) => e.status === "Resigned" || e.status === "Terminated");
  const active = employees.filter((e) => e.status !== "Resigned" && e.status !== "Terminated");
  const contractual = active.filter((e) => e.isContractual);
  const regular = active.filter((e) => !e.isContractual);

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <Sidebar active="/employees" />

      <div className="pt-14 lg:ml-60 lg:pt-0">
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">MR.DIY Careers</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Employees</h1>
          </div>
          <AdminAlertsBell />
        </header>

        <div className="p-5 sm:p-6 lg:p-8">
          <section className="mb-7 border-b border-slate-200 pb-6">
            <p className="text-sm text-slate-500">
              Everyone you&apos;ve hired, their contract window, and whether the employment contract is
              countersigned yet.
            </p>
          </section>

          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center border border-slate-200 bg-white">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
            </div>
          ) : employees.length === 0 ? (
            <div className="border border-slate-200 bg-white px-6 py-16 text-center">
              <h3 className="text-sm font-semibold text-slate-800">No employees yet</h3>
              <p className="mt-1 text-sm text-slate-500">
                Applicants you mark as Hired in Applications will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {resigned.length > 0 && (
                <section className="border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <h2 className="text-base font-bold text-slate-900">Resigned / Terminated — pending exit</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Still here until clearance and final pay are both done.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Position</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Last working day</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Clearance</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Final pay</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resigned.map((e) => (
                          <tr key={e.applicationId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-5 py-4 text-sm font-semibold text-slate-800">
                              {e.applicantName || "—"}
                              <span
                                className={`ml-2 inline-flex border px-1.5 py-0.5 text-[10px] font-semibold ${
                                  e.status === "Terminated"
                                    ? "border-rose-300 bg-rose-50 text-rose-800"
                                    : "border-sky-200 bg-sky-50 text-sky-700"
                                }`}
                              >
                                {e.status}
                              </span>
                              <p className="mt-0.5 text-xs font-normal text-slate-400">{e.branchName || "—"}</p>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{e.jobTitle || "—"}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {formatDate(e.actualLastDay ?? e.lastWorkingDay)}
                              {e.actualLastDay && e.lastWorkingDay && e.actualLastDay < e.lastWorkingDay && (
                                <p className="mt-0.5 text-[11px] font-semibold text-amber-700">Incomplete notice</p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${
                                  e.clearanceCompleted
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                              >
                                {e.clearanceCompleted ? "Complete" : "Pending"}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${
                                  e.finalPayReleased
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                              >
                                {e.finalPayReleased ? "Released" : "Pending"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <Link href="/applications" className="text-xs font-semibold text-[#e30613] hover:underline">
                                Open in Applications →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {contractual.length > 0 && (
                <section className="border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <h2 className="text-base font-bold text-slate-900">Contractual — with a contract window</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Position</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Contract period</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Days left</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Contract</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contractual.map((e) => (
                          <tr key={e.applicationId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-5 py-4 text-sm font-semibold text-slate-800">
                              {e.applicantName || "—"}
                              <p className="mt-0.5 text-xs font-normal text-slate-400">{e.branchName || "—"}</p>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{e.jobTitle || "—"}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {formatDate(e.contractStartDate)} – {formatDate(e.contractEndDate)}
                            </td>
                            <td className="px-5 py-4">
                              {e.daysLeft !== null && (
                                <span className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${daysLeftStyle(e.daysLeft)}`}>
                                  {e.daysLeft < 0 ? "Ended" : `${e.daysLeft} days`}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${
                                  e.signed
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                              >
                                {e.signed ? "Countersigned" : "Not yet signed"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <Link
                                href="/applications"
                                className="text-xs font-semibold text-[#e30613] hover:underline"
                              >
                                Open in Applications →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {regular.length > 0 && (
                <section className="border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <h2 className="text-base font-bold text-slate-900">Regular — no fixed contract term</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Position</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Hired on</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regular.map((e) => (
                          <tr key={e.applicationId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-5 py-4 text-sm font-semibold text-slate-800">
                              {e.applicantName || "—"}
                              <p className="mt-0.5 text-xs font-normal text-slate-400">{e.branchName || "—"}</p>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{e.jobTitle || "—"}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatDate(e.hiredAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
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
