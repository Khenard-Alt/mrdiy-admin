"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Application = {
  id: string;
  user_id: string;
  job_id: string;
  job_title: string | null;
  applied_at: string | null;
  status: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [totalJobs, setTotalJobs] = useState(0);
  const [totalApplications, setTotalApplications] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [approvedApplications, setApprovedApplications] =
    useState(0);

  const [recentApplications, setRecentApplications] =
    useState<Application[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  /*
   * REALTIME
   *
   * Automatically refresh dashboard when:
   * - a new application is created
   * - an application status is updated
   * - an application is deleted
   */
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

    /*
     * Also listen for job changes so Total Jobs
     * updates automatically.
     */
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

    const isAdmin = await checkAdmin();

    if (!isAdmin) {
      setLoading(false);
      return;
    }

    /*
     * TOTAL JOBS
     */
    const { count: jobsCount, error: jobsError } =
      await supabase
        .from("jobs")
        .select("*", {
          count: "exact",
          head: true,
        });

    if (!jobsError) {
      setTotalJobs(jobsCount ?? 0);
    }

    /*
     * APPLICATIONS
     */
    const {
      data: applications,
      error: applicationsError,
    } = await supabase
      .from("applications")
      .select(
        "id, user_id, job_id, job_title, applied_at, status"
      )
      .order("applied_at", {
        ascending: false,
      });

    if (!applicationsError) {
      const rows = applications ?? [];

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

      setRecentApplications(rows.slice(0, 5));
    }

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  function formatDate(date: string | null) {
    if (!date) {
      return "—";
    }

    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <main className="min-h-screen bg-gray-100">

      {/* SIDEBAR */}
      <aside className="fixed left-0 top-0 hidden h-screen w-64 bg-[#e30613] text-white lg:block">

        {/* LOGO */}
        <div className="flex h-20 items-center border-b border-white/20 px-6">
          <div className="rounded-lg bg-white px-4 py-2">
            <span className="text-2xl font-black text-[#e30613]">
              MR.DIY
            </span>
          </div>
        </div>

        {/* NAVIGATION */}
        <nav className="px-4 py-6">

          {/* DASHBOARD */}
          <button
            type="button"
            className="flex w-full items-center rounded-xl bg-white/20 px-4 py-3 text-left font-semibold"
          >
            <span className="mr-3 text-xl">
              📊
            </span>

            Dashboard
          </button>

          {/* JOBS */}
          <button
            type="button"
            onClick={() => router.push("/jobs")}
            className="mt-2 flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition hover:bg-white/10"
          >
            <span className="mr-3 text-xl">
              💼
            </span>

            Jobs
          </button>

          {/* APPLICATIONS */}
          <button
            type="button"
            onClick={() => router.push("/applications")}
            className="mt-2 flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition hover:bg-white/10"
          >
            <span className="mr-3 text-xl">
              📋
            </span>

            Applications
          </button>

        </nav>

        {/* LOGOUT */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/20 p-4">

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition hover:bg-white/10"
          >
            <span className="mr-3 text-xl">
              🚪
            </span>

            Logout
          </button>

        </div>

      </aside>

      {/* MAIN */}
      <div className="lg:ml-64">

        {/* TOP BAR */}
        <header className="flex min-h-20 items-center border-b bg-white px-6 py-4 shadow-sm lg:px-8">

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Dashboard
            </h1>

            <p className="text-sm text-gray-500">
              MR.DIY Careers Administration
            </p>
          </div>

        </header>

        {/* CONTENT */}
        <div className="p-6 lg:p-8">

          {/* WELCOME */}
          <div className="mb-8 rounded-3xl bg-[#e30613] p-7 text-white shadow-sm">

            <h2 className="text-3xl font-bold">
              Welcome, Admin!
            </h2>

            <p className="mt-2 text-white/90">
              Here's an overview of your recruitment system.
            </p>

          </div>

          {/* STAT CARDS */}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

            {/* TOTAL JOBS */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-sm text-gray-500">
                    Total Jobs
                  </p>

                  <p className="mt-2 text-4xl font-bold text-gray-900">
                    {loading ? "—" : totalJobs}
                  </p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-2xl">
                  💼
                </div>

              </div>

            </div>

            {/* TOTAL APPLICATIONS */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-sm text-gray-500">
                    Total Applications
                  </p>

                  <p className="mt-2 text-4xl font-bold text-gray-900">
                    {loading ? "—" : totalApplications}
                  </p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-2xl">
                  📋
                </div>

              </div>

            </div>

            {/* PENDING */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-sm text-gray-500">
                    Pending
                  </p>

                  <p className="mt-2 text-4xl font-bold text-gray-900">
                    {loading ? "—" : pendingApplications}
                  </p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-100 text-2xl">
                  ⏳
                </div>

              </div>

            </div>

            {/* APPROVED */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-sm text-gray-500">
                    Approved
                  </p>

                  <p className="mt-2 text-4xl font-bold text-gray-900">
                    {loading ? "—" : approvedApplications}
                  </p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-2xl">
                  ✅
                </div>

              </div>

            </div>

          </div>

          {/* RECENT APPLICATIONS */}
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">

            <div className="flex items-center justify-between border-b px-6 py-5">

              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Recent Applications
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Latest applications submitted by applicants.
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push("/applications")}
                className="font-semibold text-[#e30613] hover:underline"
              >
                View All
              </button>

            </div>

            {loading ? (
              <div className="px-6 py-16 text-center text-gray-500">
                Loading applications...
              </div>
            ) : recentApplications.length === 0 ? (
              <div className="px-6 py-16 text-center">

                <div className="text-5xl">
                  📋
                </div>

                <h3 className="mt-4 text-lg font-bold text-gray-900">
                  No applications yet
                </h3>

                <p className="mt-2 text-sm text-gray-500">
                  Applications will appear here when users apply
                  for jobs.
                </p>

              </div>
            ) : (
              <div className="divide-y">

                {recentApplications.map(
                  (application) => (
                    <div
                      key={application.id}
                      className="flex flex-col gap-3 px-6 py-5 transition hover:bg-gray-50 md:flex-row md:items-center md:justify-between"
                    >

                      <div>
                        <p className="font-semibold text-gray-900">
                          {application.job_title ||
                            `Job #${application.job_id}`}
                        </p>

                        <p className="mt-1 text-sm text-gray-500">
                          Application ID:{" "}
                          {application.id}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">

                        <span className="text-sm text-gray-500">
                          {formatDate(
                            application.applied_at
                          )}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            (
                              application.status ??
                              "Pending"
                            ).toLowerCase() === "approved"
                              ? "bg-green-100 text-green-700"
                              : (
                                  application.status ??
                                  "Pending"
                                ).toLowerCase() ===
                                "rejected"
                              ? "bg-red-100 text-red-700"
                              : (
                                  application.status ??
                                  "Pending"
                                ).toLowerCase() ===
                                "reviewed"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {application.status ||
                            "Pending"}
                        </span>

                      </div>

                    </div>
                  )
                )}

              </div>
            )}

          </div>

        </div>

      </div>

    </main>
  );
}