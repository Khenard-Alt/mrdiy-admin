"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Application = {
  id: string;
  user_id: string;
  job_id: string;
  applied_at: string | null;
  status: string | null;
  job_title: string | null;
};

type Job = {
  id: string;
  title: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [totalJobs, setTotalJobs] = useState(0);
  const [totalApplications, setTotalApplications] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [approvedApplications, setApprovedApplications] = useState(0);

  const [recentApplications, setRecentApplications] =
    useState<Application[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    const applicationChannel = supabase
      .channel("dashboard-applications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
        },
        () => {
          loadDashboard();
        }
      )
      .subscribe();

    const jobsChannel = supabase
      .channel("dashboard-jobs-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        },
        () => {
          loadDashboard();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(applicationChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, []);

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return false;
    }

    if (user.app_metadata?.role !== "admin") {
      await supabase.auth.signOut();
      router.push("/login");
      return false;
    }

    return true;
  }

  async function loadDashboard() {
    setLoading(true);
    setError("");

    const isAdmin = await checkAdmin();

    if (!isAdmin) {
      setLoading(false);
      return;
    }

    /* ============================
       TOTAL JOBS
    ============================ */

    const { count: jobsCount, error: jobsError } = await supabase
      .from("jobs")
      .select("*", {
        count: "exact",
        head: true,
      });

    if (jobsError) {
      console.error("Jobs count error:", jobsError);
    } else {
      setTotalJobs(jobsCount ?? 0);
    }

    /* ============================
       APPLICATIONS
    ============================ */

    const {
      data: applications,
      error: applicationsError,
    } = await supabase
      .from("applications")
      .select("id, user_id, job_id, status")
      .order("id", {
        ascending: false,
      });

    if (applicationsError) {
      console.error(
        "Applications loading error:",
        applicationsError
      );

      setError(applicationsError.message);
      setLoading(false);
      return;
    }

    const rows = applications ?? [];

    /* ============================
       GET JOB TITLES
    ============================ */

    const jobIds = [
      ...new Set(
        rows
          .map((application) => application.job_id)
          .filter(Boolean)
      ),
    ];

    let jobs: Job[] = [];

    if (jobIds.length > 0) {
      const { data: jobsData, error: jobsError2 } =
        await supabase
          .from("jobs")
          .select("id, title")
          .in("id", jobIds);

      if (jobsError2) {
        console.error(
          "Job titles loading error:",
          jobsError2
        );
      } else {
        jobs = (jobsData ?? []) as Job[];
      }
    }

    const jobMap = new Map<string, string>();

    jobs.forEach((job) => {
      if (job.title) {
        jobMap.set(job.id, job.title);
      }
    });

    /* ============================
       COMBINE APPLICATION DATA
    ============================ */

    const combinedApplications: Application[] =
      rows.map((application) => ({
        id: application.id,
        user_id: application.user_id,
        job_id: application.job_id,
        applied_at: null,
        status: application.status,
        job_title:
          jobMap.get(application.job_id) ??
          null,
      }));

    /* ============================
       APPLICATION COUNTS
    ============================ */

    setTotalApplications(rows.length);

    setPendingApplications(
      rows.filter(
        (application) =>
          (application.status ?? "Pending").toLowerCase() ===
          "pending"
      ).length
    );

    setApprovedApplications(
      rows.filter(
        (application) =>
          (application.status ?? "").toLowerCase() ===
          "approved"
      ).length
    );

    /*
     * Since the current applications table does not
     * expose applied_at in the known schema, use the
     * returned application order for recent records.
     */
    setRecentApplications(
      combinedApplications.slice(0, 5)
    );

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  function getStatusStyle(status: string | null) {
    const value = (status ?? "Pending").toLowerCase();

    if (value === "approved") {
      return "border-green-200 bg-green-50 text-green-700";
    }

    if (value === "rejected") {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (value === "reviewed") {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  function formatStatus(status: string | null) {
    if (!status) {
      return "Pending";
    }

    return (
      status.charAt(0).toUpperCase() +
      status.slice(1).toLowerCase()
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      {/* =====================================
          SIDEBAR
      ====================================== */}

      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-60 bg-[#e30613] text-white lg:flex lg:flex-col">
        {/* LOGO */}

        <div className="flex h-20 items-center border-b border-white/15 px-6">
          <div className="flex h-14 w-44 items-center">
            <img
              src="/logo.png"
              alt="MR.DIY"
              className="h-auto w-full object-contain"
            />
          </div>
        </div>

        {/* NAVIGATION */}

        <nav className="flex-1 px-3 py-6">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Main Menu
          </p>

          {/* DASHBOARD */}

          <button
            type="button"
            className="flex w-full border-l-4 border-white bg-white/15 px-6 py-3 text-left text-sm font-semibold"
          >
            Dashboard
          </button>

          {/* JOBS */}

          <button
            type="button"
            onClick={() => router.push("/jobs")}
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Jobs
          </button>

          {/* APPLICATIONS */}

          <button
            type="button"
            onClick={() => router.push("/applications")}
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Applications
          </button>
        </nav>

        {/* LOGOUT */}

        <div className="border-t border-white/15 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* =====================================
          MAIN
      ====================================== */}

      <div className="lg:ml-60">
        {/* HEADER */}

        <header className="sticky top-0 z-10 flex min-h-20 items-center border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
          </div>
        </header>

        {/* CONTENT */}

        <div className="p-5 sm:p-6 lg:p-8">
          {/* INTRO */}

          <section className="mb-7 border-b border-slate-200 pb-6">
            <p className="text-sm text-slate-500">
              Monitor job postings and application activity.
            </p>
          </section>

          {/* =====================================
              OVERVIEW
          ====================================== */}

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Overview
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Current recruitment activity
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* TOTAL JOBS */}

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

                <button
                  type="button"
                  onClick={() => router.push("/jobs")}
                  className="mt-5 text-xs font-semibold text-[#e30613] hover:underline"
                >
                  Manage jobs →
                </button>
              </div>

              {/* APPLICATIONS */}

              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Applications
                    </p>

                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {loading
                        ? "—"
                        : totalApplications}
                    </p>
                  </div>

                  <span className="border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                    ALL
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push("/applications")
                  }
                  className="mt-5 text-xs font-semibold text-[#e30613] hover:underline"
                >
                  View applications →
                </button>
              </div>

              {/* PENDING */}

              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Pending Review
                    </p>

                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {loading
                        ? "—"
                        : pendingApplications}
                    </p>
                  </div>

                  <span className="border border-yellow-100 bg-yellow-50 px-2.5 py-1 text-[10px] font-bold text-yellow-700">
                    PENDING
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push("/applications")
                  }
                  className="mt-5 text-xs font-semibold text-[#e30613] hover:underline"
                >
                  Review applications →
                </button>
              </div>

              {/* APPROVED */}

              <div className="border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Approved
                    </p>

                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {loading
                        ? "—"
                        : approvedApplications}
                    </p>
                  </div>

                  <span className="border border-green-100 bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">
                    APPROVED
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push("/applications")
                  }
                  className="mt-5 text-xs font-semibold text-[#e30613] hover:underline"
                >
                  View approved →
                </button>
              </div>
            </div>
          </section>

          {/* =====================================
              QUICK ACTIONS
          ====================================== */}

          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Quick Actions
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Frequently used recruitment management actions.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* MANAGE JOBS */}

              <button
                type="button"
                onClick={() => router.push("/jobs")}
                className="border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#e30613]"
              >
                <p className="text-sm font-bold text-slate-900">
                  Manage Jobs
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Create new positions, update job details,
                  and manage current job postings.
                </p>

                <p className="mt-4 text-xs font-semibold text-[#e30613]">
                  Open Jobs →
                </p>
              </button>

              {/* APPLICATIONS */}

              <button
                type="button"
                onClick={() =>
                  router.push("/applications")
                }
                className="border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#e30613]"
              >
                <p className="text-sm font-bold text-slate-900">
                  Review Applications
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Review applicants and update their
                  application status.
                </p>

                <p className="mt-4 text-xs font-semibold text-[#e30613]">
                  Open Applications →
                </p>
              </button>
            </div>
          </section>

          {/* =====================================
              RECENT APPLICATIONS
          ====================================== */}

          <section className="mt-8 border border-slate-200 bg-white shadow-sm">
            {/* HEADER */}

            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Recent Applications
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Latest applications received by the recruitment
                  system.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  router.push("/applications")
                }
                className="self-start border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#e30613] hover:text-[#e30613] sm:self-auto"
              >
                View all
              </button>
            </div>

            {/* ERROR */}

            {error && (
              <div className="border-b border-red-200 bg-red-50 px-5 py-4">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* LOADING */}

            {loading ? (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />

                <p className="mt-4 text-sm text-slate-500">
                  Loading applications...
                </p>
              </div>
            ) : recentApplications.length === 0 ? (
              /* EMPTY */

              <div className="px-5 py-14 text-center">
                <h3 className="text-sm font-semibold text-slate-800">
                  No applications recorded
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  New applicant submissions will appear here.
                </p>
              </div>
            ) : (
              /* TABLE */

              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Position
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Applicant
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Application ID
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentApplications.map(
                      (application) => (
                        <tr
                          key={application.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >
                          {/* POSITION */}

                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-slate-800">
                              {application.job_title ||
                                `Job #${application.job_id}`}
                            </p>
                          </td>

                          {/* APPLICANT */}

                          <td className="px-5 py-4">
                            <p className="font-mono text-xs text-slate-500">
                              {application.user_id}
                            </p>
                          </td>

                          {/* APPLICATION ID */}

                          <td className="px-5 py-4">
                            <span className="font-mono text-xs text-slate-500">
                              {application.id}
                            </span>
                          </td>

                          {/* STATUS */}

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${getStatusStyle(
                                application.status
                              )}`}
                            >
                              {formatStatus(
                                application.status
                              )}
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* FOOTER */}

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-400">
              MR.DIY Careers Administration
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}