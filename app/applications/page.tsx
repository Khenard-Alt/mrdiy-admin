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

type Profile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  desired_position: string | null;
  years_experience: number | null;
  resume_file_name: string | null;
  resume_url: string | null;
};

type ApplicationWithProfile = Application & {
  profile: Profile | null;
};

export default function ApplicationsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [applications, setApplications] = useState<
    ApplicationWithProfile[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [selectedApplication, setSelectedApplication] =
    useState<ApplicationWithProfile | null>(null);

  const [updating, setUpdating] = useState(false);
  const [openingResume, setOpeningResume] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  /*
   * SUPABASE REALTIME
   *
   * Automatically reload applications when:
   * - a new application is inserted
   * - an application is updated
   * - an application is deleted
   */
  useEffect(() => {
    const channel = supabase
      .channel("applications-realtime")
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

    return () => {
      supabase.removeChannel(channel);
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

    const {
      data: applicationData,
      error: applicationError,
    } = await supabase
      .from("applications")
      .select(
        "id, user_id, job_id, job_title, applied_at, status"
      )
      .order("applied_at", {
        ascending: false,
      });

    if (applicationError) {
      setError(applicationError.message);
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
     * Applications and profiles do not have a database
     * foreign-key relationship, so profiles are retrieved
     * separately using the user IDs.
     */

    const userIds = [
      ...new Set(
        applicationRows.map(
          (application) => application.user_id
        )
      ),
    ];

    const { data: profileData, error: profileError } =
      await supabase
        .from("profiles")
        .select(
          "user_id, full_name, email, phone, location, desired_position, years_experience, resume_file_name, resume_url"
        )
        .in("user_id", userIds);

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const profiles = profileData ?? [];

    const combined: ApplicationWithProfile[] =
      applicationRows.map((application) => {
        const profile =
          profiles.find(
            (item) =>
              item.user_id === application.user_id
          ) ?? null;

        return {
          ...application,
          profile,
        };
      });

    setApplications(combined);
    setLoading(false);
  }

  async function updateStatus(
    applicationId: string,
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

  function getStatusClass(status: string | null) {
    const value = (status ?? "Pending").toLowerCase();

    if (value === "approved") {
      return "bg-green-100 text-green-700";
    }

    if (value === "rejected") {
      return "bg-red-100 text-red-700";
    }

    if (value === "reviewed") {
      return "bg-blue-100 text-blue-700";
    }

    return "bg-yellow-100 text-yellow-700";
  }

  async function handleViewResume() {
    const resumeUrl =
      selectedApplication?.profile?.resume_url;

    if (!resumeUrl) {
      setError("No resume file is available for this applicant.");
      return;
    }

    setOpeningResume(true);
    setError("");

    try {
      let finalUrl = resumeUrl.trim();

      /*
       * If resume_url is already a complete URL,
       * use it directly.
       */
      if (
        !finalUrl.startsWith("http://") &&
        !finalUrl.startsWith("https://")
      ) {
        /*
         * Otherwise, treat resume_url as a path
         * inside the public "resumes" bucket.
         */
        const { data } = supabase.storage
          .from("resumes")
          .getPublicUrl(finalUrl);

        finalUrl = data.publicUrl;
      }

      window.open(
        finalUrl,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (err) {
      console.error(err);
      setError("Unable to open the resume.");
    } finally {
      setOpeningResume(false);
    }
  }

  const filteredApplications = applications.filter(
    (application) => {
      const searchText = search.toLowerCase().trim();

      if (!searchText) {
        return true;
      }

      const name =
        application.profile?.full_name ?? "";

      const email =
        application.profile?.email ?? "";

      const job =
        application.job_title ?? "";

      const status =
        application.status ?? "";

      return (
        name.toLowerCase().includes(searchText) ||
        email.toLowerCase().includes(searchText) ||
        job.toLowerCase().includes(searchText) ||
        status.toLowerCase().includes(searchText)
      );
    }
  );

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
            onClick={() => router.push("/dashboard")}
            className="flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition hover:bg-white/10"
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
            className="mt-2 flex w-full items-center rounded-xl bg-white/20 px-4 py-3 text-left font-semibold"
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

      {/* MAIN CONTENT */}
      <div className="lg:ml-64">

        {/* TOP BAR */}
        <header className="sticky top-0 z-10 flex min-h-20 items-center border-b bg-white px-6 py-4 shadow-sm lg:px-8">

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Applications
            </h1>

            <p className="text-sm text-gray-500">
              Review and manage job applications
            </p>
          </div>

        </header>

        {/* CONTENT */}
        <div className="p-6 lg:p-8">

          {/* HEADER */}
          <div className="mb-6">

            <h2 className="text-xl font-bold text-gray-900">
              Applicant Applications
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {applications.length} application
              {applications.length !== 1
                ? "s"
                : ""}{" "}
              received
            </p>

          </div>

          {/* ERROR */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SEARCH */}
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm">

            <div className="relative">

              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                🔍
              </span>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search applicant, email, job, or status..."
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-4 text-gray-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              />

            </div>

          </div>

          {/* APPLICATIONS */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

            {loading ? (
              <div className="flex min-h-64 items-center justify-center">

                <div className="text-center">

                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-[#e30613]" />

                  <p className="mt-4 text-sm text-gray-500">
                    Loading applications...
                  </p>

                </div>

              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="px-6 py-16 text-center">

                <div className="text-5xl">
                  📋
                </div>

                <h3 className="mt-4 text-lg font-bold text-gray-900">
                  {search
                    ? "No applications found"
                    : "No applications yet"}
                </h3>

                <p className="mt-2 text-sm text-gray-500">
                  {search
                    ? "Try a different search term."
                    : "Applications from the mobile app will appear here."}
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1000px]">

                  <thead className="bg-gray-50">

                    <tr>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Applicant
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Job Applied
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Location
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Applied
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Status
                      </th>

                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-gray-100">

                    {filteredApplications.map(
                      (application) => {

                        const profile =
                          application.profile;

                        return (
                          <tr
                            key={application.id}
                            className="transition hover:bg-gray-50"
                          >

                            {/* APPLICANT */}
                            <td className="px-6 py-5">

                              <div>

                                <p className="font-bold text-gray-900">
                                  {profile?.full_name ||
                                    "Unknown Applicant"}
                                </p>

                                <p className="mt-1 text-sm text-gray-500">
                                  {profile?.email ||
                                    "No email"}
                                </p>

                              </div>

                            </td>

                            {/* JOB */}
                            <td className="px-6 py-5">

                              <p className="font-semibold text-gray-800">
                                {application.job_title ||
                                  `Job #${application.job_id}`}
                              </p>

                            </td>

                            {/* LOCATION */}
                            <td className="px-6 py-5">

                              <p className="text-sm text-gray-600">
                                {profile?.location ||
                                  "—"}
                              </p>

                            </td>

                            {/* DATE */}
                            <td className="px-6 py-5">

                              <p className="text-sm text-gray-600">
                                {formatDate(
                                  application.applied_at
                                )}
                              </p>

                            </td>

                            {/* STATUS */}
                            <td className="px-6 py-5">

                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                                  application.status
                                )}`}
                              >
                                {application.status ||
                                  "Pending"}
                              </span>

                            </td>

                            {/* ACTION */}
                            <td className="px-6 py-5">

                              <div className="flex justify-end">

                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedApplication(
                                      application
                                    )
                                  }
                                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                                >
                                  👁️ View
                                </button>

                              </div>

                            </td>

                          </tr>
                        );
                      }
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* APPLICANT DETAILS MODAL */}
      {selectedApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">

          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">

            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b px-6 py-5">

              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Applicant Details
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Review the applicant information and
                  application status.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedApplication(null)
                }
                className="rounded-xl px-3 py-2 text-xl text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>

            </div>

            {/* DETAILS */}
            <div className="p-6">

              {/* APPLICANT INFORMATION */}
              <div className="rounded-2xl bg-gray-50 p-5">

                <h3 className="font-bold text-gray-900">
                  Applicant Information
                </h3>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Full Name
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {selectedApplication.profile
                        ?.full_name ||
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Email
                    </p>

                    <p className="mt-1 break-all text-sm font-medium text-gray-900">
                      {selectedApplication.profile
                        ?.email ||
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Phone
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {selectedApplication.profile
                        ?.phone ||
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Location
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {selectedApplication.profile
                        ?.location ||
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Desired Position
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {selectedApplication.profile
                        ?.desired_position ||
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Years of Experience
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {selectedApplication.profile
                        ?.years_experience ??
                        "—"}
                    </p>
                  </div>

                </div>

              </div>

              {/* APPLICATION */}
              <div className="mt-5 rounded-2xl border border-gray-200 p-5">

                <h3 className="font-bold text-gray-900">
                  Application
                </h3>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Job
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {selectedApplication.job_title ||
                        `Job #${selectedApplication.job_id}`}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Date Applied
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {formatDate(
                        selectedApplication.applied_at
                      )}
                    </p>
                  </div>

                </div>

              </div>

              {/* RESUME */}
              <div className="mt-5 rounded-2xl border border-gray-200 p-5">

                <div className="flex items-center justify-between gap-4">

                  <div>
                    <h3 className="font-bold text-gray-900">
                      Resume
                    </h3>

                    {selectedApplication.profile
                      ?.resume_file_name ? (
                      <p className="mt-2 break-all text-sm text-gray-600">
                        📄{" "}
                        {
                          selectedApplication.profile
                            .resume_file_name
                        }
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">
                        No resume uploaded.
                      </p>
                    )}
                  </div>

                  {selectedApplication.profile
                    ?.resume_url && (
                    <button
                      type="button"
                      onClick={handleViewResume}
                      disabled={openingResume}
                      className="shrink-0 rounded-xl bg-[#e30613] px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {openingResume
                        ? "Opening..."
                        : "📄 View Resume"}
                    </button>
                  )}

                </div>

                {!selectedApplication.profile
                  ?.resume_url &&
                  selectedApplication.profile
                    ?.resume_file_name && (
                    <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                      Resume file name is available, but
                      no resume URL was saved in the profile.
                    </p>
                  )}

              </div>

              {/* STATUS */}
              <div className="mt-5 rounded-2xl border border-gray-200 p-5">

                <h3 className="font-bold text-gray-900">
                  Application Status
                </h3>

                <p className="mt-1 text-sm text-gray-500">
                  Update the application status below.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">

                  <button
                    type="button"
                    disabled={updating}
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Pending"
                      )
                    }
                    className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                  >
                    ⏳ Pending
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
                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    👁 Reviewed
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
                    className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    ✅ Approved
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
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 sm:col-span-3"
                  >
                    ❌ Rejected
                  </button>

                </div>

              </div>

              {/* CLOSE */}
              <div className="mt-6 flex justify-end">

                <button
                  type="button"
                  onClick={() =>
                    setSelectedApplication(null)
                  }
                  className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
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