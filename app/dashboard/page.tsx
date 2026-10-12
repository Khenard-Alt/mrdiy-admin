"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminAlertsBell from "@/components/AdminAlertsBell";
import Sidebar from "@/components/Sidebar";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type Application = {
  id: string;
  user_id: string;
  job_id: string;
  applied_at: string | null;
  status: string | null;
  job_title: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
};

type UpcomingInterview = {
  id: string;
  applicationId: string;
  scheduledAt: string;
  venue: string | null;
  mode: "in_person" | "online";
  meetingLink: string | null;
  applicantResponse: "Pending" | "Confirmed" | "Declined";
  jobTitle: string | null;
  applicantName: string | null;
};

export default function DashboardPage() {
  const router = useRouter();

  const [role, setRole] = useState<"super_admin" | "hr_officer" | "branch_manager" | null>(null);
  const [totalJobs, setTotalJobs] = useState<number | null>(0);
  const [totalApplications, setTotalApplications] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [approvedApplications, setApprovedApplications] = useState(0);

  const [recentApplications, setRecentApplications] = useState<Application[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<UpcomingInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/dashboard");

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load dashboard.");
      }

      const data = await response.json();

      setRole(data.role ?? null);
      setTotalJobs(data.totalJobs);
      setTotalApplications(data.totalApplications);
      setPendingApplications(data.pendingApplications);
      setApprovedApplications(data.approvedApplications);
      setRecentApplications(data.recentApplications);
      setUpcomingInterviews(data.upcomingInterviews ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeRefresh(["applications", "jobs", "interviews"], loadDashboard);

  function formatInterviewWhen(iso: string) {
    return new Date(iso).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const RESPONSE_STYLE: Record<UpcomingInterview["applicantResponse"], string> = {
    Pending: "border-yellow-200 bg-yellow-50 text-yellow-700",
    Confirmed: "border-green-200 bg-green-50 text-green-700",
    Declined: "border-red-200 bg-red-50 text-red-700",
  };

  function getStatusStyle(status: string | null) {
    const value = (status ?? "Pending").toLowerCase();
    if (value === "approved" || value === "hired") {
      return "border-green-200 bg-green-50 text-green-700";
    }
    if (value === "rejected") {
      return "border-red-200 bg-red-50 text-red-700";
    }
    if (value === "reviewed" || value === "shortlisted") {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  function formatStatus(status: string | null) {
    if (!status) return "Pending";
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }

  // Hidden by default until the role is confirmed, so the Jobs card/action
  // never flashes in for a branch manager and then disappears.
  const canManageJobs = role === "super_admin" || role === "hr_officer";

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <Sidebar active="/dashboard" />

      {/* MAIN CONTENT */}
      <div className="pt-14 lg:ml-60 lg:pt-0">
        {/* HEADER */}
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
          </div>
          <AdminAlertsBell />
        </header>

        {/* CONTENT */}
        <div className="p-5 sm:p-6 lg:p-8">
          {/* INTRO */}
          <section className="mb-7 border-b border-slate-200 pb-6">
            <p className="text-sm text-slate-500">
              Monitor job postings and application activity.
            </p>
          </section>

          {/* OVERVIEW CARDS */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Overview</h2>
              <p className="mt-1 text-sm text-slate-500">Current recruitment activity</p>
            </div>

            <div
              className={`grid gap-4 sm:grid-cols-2 ${
                canManageJobs ? "xl:grid-cols-4" : "xl:grid-cols-3"
              }`}
            >
              {/* TOTAL JOBS (hidden for branch managers — job postings are company-wide, not theirs) */}
              {canManageJobs && (
                <div className="border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Total Jobs
                      </p>
                      <p className="mt-3 text-3xl font-bold text-slate-900">
                        {loading ? "—" : totalJobs}
                      </p>
                    </div>
                    <span className="border border-red-100 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-[#e30613]">
                      JOBS
                    </span>
                  </div>
                  <Link
                    href="/jobs"
                    className="mt-5 inline-block text-xs font-semibold text-[#e30613] hover:underline"
                  >
                    Manage jobs →
                  </Link>
                </div>
              )}

              {/* APPLICATIONS */}
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {role === "branch_manager" ? "Applications (your branch)" : "Applications"}
                    </p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {loading ? "—" : totalApplications}
                    </p>
                  </div>
                  <span className="border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                    ALL
                  </span>
                </div>
                <Link
                  href="/applications"
                  className="mt-5 inline-block text-xs font-semibold text-[#e30613] hover:underline"
                >
                  View applications →
                </Link>
              </div>

              {/* PENDING */}
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Pending Review
                    </p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {loading ? "—" : pendingApplications}
                    </p>
                  </div>
                  <span className="border border-yellow-100 bg-yellow-50 px-2.5 py-1 text-[10px] font-bold text-yellow-700">
                    PENDING
                  </span>
                </div>
                <Link
                  href="/applications"
                  className="mt-5 inline-block text-xs font-semibold text-[#e30613] hover:underline"
                >
                  Review applications →
                </Link>
              </div>

              {/* APPROVED / HIRED */}
              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Approved
                    </p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {loading ? "—" : approvedApplications}
                    </p>
                  </div>
                  <span className="border border-green-100 bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">
                    APPROVED
                  </span>
                </div>
                <Link
                  href="/applications"
                  className="mt-5 inline-block text-xs font-semibold text-[#e30613] hover:underline"
                >
                  View approved →
                </Link>
              </div>
            </div>
          </section>

          {/* QUICK ACTIONS */}
          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
              <p className="mt-1 text-sm text-slate-500">
                Frequently used recruitment management actions.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {canManageJobs && (
                <Link
                  href="/jobs"
                  className="block border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#e30613]"
                >
                  <p className="text-sm font-bold text-slate-900">Manage Jobs</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Create new positions, update job details, and manage current job postings.
                  </p>
                  <p className="mt-4 text-xs font-semibold text-[#e30613]">Open Jobs →</p>
                </Link>
              )}

              <Link
                href="/applications"
                className="block border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#e30613]"
              >
                <p className="text-sm font-bold text-slate-900">Review Applications</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Review applicants and update their application status.
                </p>
                <p className="mt-4 text-xs font-semibold text-[#e30613]">Open Applications →</p>
              </Link>
            </div>
          </section>

          {/* UPCOMING INTERVIEWS */}
          <section className="mt-8 border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Upcoming Interviews</h2>
                <p className="mt-1 text-sm text-slate-500">
                  The next {upcomingInterviews.length} scheduled, soonest first.
                </p>
              </div>
            </div>

            {upcomingInterviews.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No interviews scheduled yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingInterviews.map((interview) => (
                  <li key={interview.id}>
                    <Link
                      href="/applications"
                      className="flex flex-col gap-2 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {interview.applicantName || "Applicant"} · {interview.jobTitle || "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatInterviewWhen(interview.scheduledAt)} ·{" "}
                          {interview.mode === "online" ? "Online" : interview.venue || "—"}
                        </p>
                      </div>

                      <span
                        className={`inline-flex w-fit border px-2.5 py-1 text-[11px] font-semibold ${RESPONSE_STYLE[interview.applicantResponse]}`}
                      >
                        {interview.applicantResponse === "Pending"
                          ? "Awaiting response"
                          : interview.applicantResponse}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* RECENT APPLICATIONS */}
          <section className="mt-8 border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Recent Applications</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Latest applications received by the recruitment system.
                </p>
              </div>

              <Link
                href="/applications"
                className="self-start border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#e30613] hover:text-[#e30613] sm:self-auto"
              >
                View all
              </Link>
            </div>

            {error && (
              <div className="border-b border-red-200 bg-red-50 px-5 py-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
                <p className="mt-4 text-sm text-slate-500">Loading applications...</p>
              </div>
            ) : recentApplications.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <h3 className="text-sm font-semibold text-slate-800">No applications recorded</h3>
                <p className="mt-1 text-sm text-slate-500">
                  New applicant submissions will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Position
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Applicant
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Email
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentApplications.map((application) => (
                      <tr
                        key={application.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-800">
                            {application.job_title || `Job #${application.job_id}`}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-800">
                            {application.applicant_name || "Name not available"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-slate-500">
                            {application.applicant_email || "No email"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${getStatusStyle(
                              application.status
                            )}`}
                          >
                            {formatStatus(application.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* FOOTER */}
          <footer className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-400">MR.DIY Careers Administration</p>
          </footer>
        </div>
      </div>
    </main>
  );
}
