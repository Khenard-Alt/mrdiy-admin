"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Application = {
  id: number;
  user_id: number | null;
  job_id: number | null;
  status: string | null;
};

type Job = {
  id: number;
  title: string | null;
  location: string | null;
  salary: string | null;
};

type ApplicationWithJob = Application & {
  job: Job | null;
};

export default function ApplicationsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [applications, setApplications] = useState<
    ApplicationWithJob[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [selectedApplication, setSelectedApplication] =
    useState<ApplicationWithJob | null>(null);

  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  useEffect(() => {
    const applicationChannel = supabase
      .channel("applications-page-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
        },
        () => {
          loadApplications();
        }
      )
      .subscribe();

    const jobsChannel = supabase
      .channel("applications-jobs-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        },
        () => {
          loadApplications();
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

  async function loadApplications() {
    setLoading(true);
    setError("");

    const isAdmin = await checkAdmin();

    if (!isAdmin) {
      setLoading(false);
      return;
    }

    /*
      IMPORTANT:
      Based on your database structure, we only request
      columns that exist in applications.
    */

    const {
      data: applicationData,
      error: applicationError,
    } = await supabase
      .from("applications")
      .select("id, user_id, job_id, status")
      .order("id", {
        ascending: false,
      });

    if (applicationError) {
      setError(applicationError.message);
      setApplications([]);
      setLoading(false);
      return;
    }

    const applicationRows = applicationData ?? [];

    if (applicationRows.length === 0) {
      setApplications([]);
      setLoading(false);
      return;
    }

    /*
      Get the job IDs used by applications.
    */

    const jobIds = [
      ...new Set(
        applicationRows
          .map((application) => application.job_id)
          .filter((id): id is number => id !== null)
      ),
    ];

    let jobs: Job[] = [];

    if (jobIds.length > 0) {
      const {
        data: jobData,
        error: jobError,
      } = await supabase
        .from("jobs")
        .select("id, title, location, salary")
        .in("id", jobIds);

      if (jobError) {
        setError(jobError.message);
        setApplications([]);
        setLoading(false);
        return;
      }

      jobs = jobData ?? [];
    }

    /*
      Combine applications with their jobs.
    */

    const combined: ApplicationWithJob[] =
      applicationRows.map((application) => {
        const job =
          jobs.find(
            (item) => item.id === application.job_id
          ) ?? null;

        return {
          ...application,
          job,
        };
      });

    setApplications(combined);
    setLoading(false);
  }

  async function updateStatus(
    applicationId: number,
    status: string
  ) {
    setUpdating(true);
    setError("");

    const { error } = await supabase
      .from("applications")
      .update({
        status,
      })
      .eq("id", applicationId);

    if (error) {
      setError(error.message);
      setUpdating(false);
      return;
    }

    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              status,
            }
          : application
      )
    );

    setSelectedApplication((current) =>
      current && current.id === applicationId
        ? {
            ...current,
            status,
          }
        : current
    );

    setUpdating(false);
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

  const filteredApplications = applications.filter(
    (application) => {
      const searchText = search.toLowerCase().trim();

      if (!searchText) {
        return true;
      }

      const userId = String(
        application.user_id ?? ""
      );

      const jobTitle =
        application.job?.title ?? "";

      const location =
        application.job?.location ?? "";

      const status =
        application.status ?? "";

      return (
        userId.toLowerCase().includes(searchText) ||
        jobTitle.toLowerCase().includes(searchText) ||
        location.toLowerCase().includes(searchText) ||
        status.toLowerCase().includes(searchText)
      );
    }
  );

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">

      {/* SIDEBAR */}
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

        {/* MENU */}
        <nav className="flex-1 px-3 py-6">

          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Main Menu
          </p>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => router.push("/jobs")}
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Jobs
          </button>

          <button
            type="button"
            className="mt-1 flex w-full border-l-4 border-white bg-white/15 px-6 py-3 text-left text-sm font-semibold"
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

      {/* MAIN */}
      <div className="lg:ml-60">

        {/* HEADER */}
        <header className="sticky top-0 z-10 flex min-h-20 items-center border-b border-slate-200 bg-white px-6 lg:px-8">

          <div>

            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Applications
            </h1>

          </div>

        </header>

        {/* CONTENT */}
        <div className="p-5 sm:p-6 lg:p-8">

          {/* INTRO */}
          <section className="mb-7 border-b border-slate-200 pb-6">

            <p className="text-sm text-slate-500">
              Review and manage applications submitted by candidates.
            </p>

            <p className="mt-2 text-xs font-medium text-slate-400">
              {applications.length} application
              {applications.length !== 1 ? "s" : ""} received
            </p>

          </section>

          {/* ERROR */}
          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SEARCH */}
          <section className="mb-6 border border-slate-200 bg-white p-4 shadow-sm">

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  Applicant Applications
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Search by applicant, position, location, or status.
                </p>

              </div>

              <div className="w-full sm:max-w-sm">

                <input
                  type="text"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search applications..."
                  className="w-full border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-[#e30613]"
                />

              </div>

            </div>

          </section>

          {/* APPLICATION TABLE */}
          <section className="border border-slate-200 bg-white shadow-sm">

            {loading ? (

              <div className="flex min-h-64 items-center justify-center">

                <div className="text-center">

                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />

                  <p className="mt-4 text-sm text-slate-500">
                    Loading applications...
                  </p>

                </div>

              </div>

            ) : filteredApplications.length === 0 ? (

              <div className="px-6 py-16 text-center">

                <h3 className="text-sm font-semibold text-slate-800">
                  {search
                    ? "No applications found"
                    : "No applications yet"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {search
                    ? "Try another search term."
                    : "Applications submitted by users will appear here."}
                </p>

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[900px] text-left">

                  <thead>

                    <tr className="border-b border-slate-200 bg-slate-50">

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Applicant
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Position
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {filteredApplications.map(
                      (application) => (

                        <tr
                          key={application.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >

                          {/* APPLICANT */}
                          <td className="px-5 py-4">

                            <p className="text-sm font-semibold text-slate-800">
                              User #{application.user_id ?? "—"}
                            </p>

                            <p className="mt-1 font-mono text-xs text-slate-400">
                              Application #{application.id}
                            </p>

                          </td>

                          {/* POSITION */}
                          <td className="px-5 py-4">

                            <p className="max-w-xs text-sm font-medium text-slate-700">
                              {application.job?.title ||
                                `Job #${application.job_id ?? "—"}`}
                            </p>

                          </td>

                          {/* LOCATION */}
                          <td className="px-5 py-4">

                            <p className="text-sm text-slate-600">
                              {application.job?.location || "—"}
                            </p>

                          </td>

                          {/* STATUS */}
                          <td className="px-5 py-4">

                            <span
                              className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${getStatusStyle(
                                application.status
                              )}`}
                            >
                              {application.status || "Pending"}
                            </span>

                          </td>

                          {/* ACTION */}
                          <td className="px-5 py-4">

                            <div className="flex justify-end">

                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedApplication(
                                    application
                                  )
                                }
                                className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#e30613] hover:text-[#e30613]"
                              >
                                View
                              </button>

                            </div>

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

      {/* APPLICATION DETAILS */}
      {selectedApplication && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">

          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">

            {/* HEADER */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">

              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  MR.DIY Careers
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Application Details
                </h2>

              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedApplication(null)
                }
                className="flex h-9 w-9 items-center justify-center border border-slate-200 text-xl text-slate-500 hover:bg-slate-50"
              >
                ×
              </button>

            </div>

            {/* CONTENT */}
            <div className="p-6">

              <section className="border border-slate-200 p-5">

                <h3 className="text-sm font-bold text-slate-900">
                  Application Information
                </h3>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Application ID
                    </p>

                    <p className="mt-1 font-mono text-sm text-slate-700">
                      {selectedApplication.id}
                    </p>

                  </div>

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Applicant User ID
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {selectedApplication.user_id ?? "—"}
                    </p>

                  </div>

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Position
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {selectedApplication.job?.title ||
                        `Job #${selectedApplication.job_id ?? "—"}`}
                    </p>

                  </div>

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Location
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {selectedApplication.job?.location || "—"}
                    </p>

                  </div>

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Salary
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {selectedApplication.job?.salary || "—"}
                    </p>

                  </div>

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Status
                    </p>

                    <span
                      className={`mt-1 inline-flex border px-2.5 py-1 text-[11px] font-semibold ${getStatusStyle(
                        selectedApplication.status
                      )}`}
                    >
                      {selectedApplication.status ||
                        "Pending"}
                    </span>

                  </div>

                </div>

              </section>

              {/* STATUS */}
              <section className="mt-5 border border-slate-200 p-5">

                <h3 className="text-sm font-bold text-slate-900">
                  Update Status
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Select the current status of this application.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">

                  <button
                    type="button"
                    disabled={updating}
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Pending"
                      )
                    }
                    className="border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                  >
                    Pending
                  </button>

                  <button
                    type="button"
                    disabled={updating}
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Reviewed"
                      )
                    }
                    className="border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    Reviewed
                  </button>

                  <button
                    type="button"
                    disabled={updating}
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Approved"
                      )
                    }
                    className="border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    Approved
                  </button>

                  <button
                    type="button"
                    disabled={updating}
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Rejected"
                      )
                    }
                    className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Rejected
                  </button>

                </div>

              </section>

              {/* CLOSE */}
              <div className="mt-6 flex justify-end">

                <button
                  type="button"
                  onClick={() =>
                    setSelectedApplication(null)
                  }
                  className="border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>

              </div>

            </div>

          </div>

        </div>

      )}

    </main>
  );
}