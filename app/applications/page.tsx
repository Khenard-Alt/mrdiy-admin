"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Application = {
  id: string;
  user_id: string | null;
  job_id: string | null;
  applicant_id: string | null;
  resume_url: string | null;
  status: string | null;
  match_score: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  resume_url: string | null;
  resume_name: string | null;
  resume_uploaded_at: string | null;
};

type Job = {
  id: string;
  title: string | null;
  location: string | null;
  salary: string | null;
};

type ApplicationRow = Application & {
  profile: Profile | null;
  job: Job | null;
};

export default function ApplicationsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [applications, setApplications] = useState<
    ApplicationRow[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All");

  const [selectedApplication, setSelectedApplication] =
    useState<ApplicationRow | null>(null);

  const [updating, setUpdating] = useState(false);

  // ============================================================
  // LOAD APPLICATIONS
  // ============================================================

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        data: applicationData,
        error: applicationError,
      } = await supabase
        .from("applications")
        .select(`
          id,
          user_id,
          job_id,
          applicant_id,
          resume_url,
          status,
          match_score,
          created_at,
          updated_at
        `)
        .order("created_at", {
          ascending: false,
        });

      if (applicationError) {
        throw new Error(applicationError.message);
      }

      const applicationRows =
        (applicationData ?? []) as Application[];

      if (applicationRows.length === 0) {
        setApplications([]);
        setLoading(false);
        return;
      }

      // ========================================================
      // LOAD PROFILES
      // ========================================================

      const profileIds = [
        ...new Set(
          applicationRows
            .map((item) => item.user_id)
            .filter(
              (id): id is string =>
                Boolean(id)
            )
        ),
      ];

      let profiles: Profile[] = [];

      if (profileIds.length > 0) {
        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(`
            id,
            full_name,
            email,
            phone,
            location,
            resume_url,
            resume_name,
            resume_uploaded_at
          `)
          .in("id", profileIds);

        if (profileError) {
          throw new Error(
            profileError.message
          );
        }

        profiles =
          (profileData ?? []) as Profile[];
      }

      // ========================================================
      // LOAD JOBS
      // ========================================================

      const jobIds = [
        ...new Set(
          applicationRows
            .map((item) => item.job_id)
            .filter(
              (id): id is string =>
                Boolean(id)
            )
        ),
      ];

      let jobs: Job[] = [];

      if (jobIds.length > 0) {
        const {
          data: jobData,
          error: jobError,
        } = await supabase
          .from("jobs")
          .select(`
            id,
            title,
            location,
            salary
          `)
          .in("id", jobIds);

        if (jobError) {
          throw new Error(
            jobError.message
          );
        }

        jobs = (jobData ?? []) as Job[];
      }

      // ========================================================
      // COMBINE DATA
      // ========================================================

      const combined: ApplicationRow[] =
        applicationRows.map(
          (application) => {
            const profile =
              profiles.find(
                (item) =>
                  item.id ===
                  application.user_id
              ) ?? null;

            const job =
              jobs.find(
                (item) =>
                  item.id ===
                  application.job_id
              ) ?? null;

            return {
              ...application,
              profile,
              job,
            };
          }
        );

      setApplications(combined);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // RESUME URL
  // ============================================================

  function getResumeUrl(
    application: ApplicationRow
  ) {
    const resumeUrl =
      application.resume_url ||
      application.profile?.resume_url ||
      null;

    if (!resumeUrl) {
      return null;
    }

    if (
      resumeUrl.startsWith(
        "http://"
      ) ||
      resumeUrl.startsWith(
        "https://"
      )
    ) {
      return resumeUrl;
    }

    if (resumeUrl.startsWith("/")) {
      return resumeUrl;
    }

    const { data } =
      supabase.storage
        .from("resumes")
        .getPublicUrl(resumeUrl);

    return data.publicUrl;
  }

  // ============================================================
  // UPDATE STATUS
  // ============================================================

  async function updateStatus(
    applicationId: string,
    newStatus: string
  ) {
    setUpdating(true);
    setError("");

    try {
      const { error } =
        await supabase
          .from("applications")
          .update({
            status: newStatus,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            applicationId
          );

      if (error) {
        throw new Error(
          error.message
        );
      }

      setApplications(
        (current) =>
          current.map(
            (application) =>
              application.id ===
              applicationId
                ? {
                    ...application,
                    status:
                      newStatus,
                  }
                : application
          )
      );

      setSelectedApplication(
        (current) =>
          current &&
          current.id ===
            applicationId
            ? {
                ...current,
                status:
                  newStatus,
              }
            : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update status."
      );
    } finally {
      setUpdating(false);
    }
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  async function handleLogout() {
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  // ============================================================
  // DATE
  // ============================================================

  function formatDate(
    date: string | null
  ) {
    if (!date) {
      return "—";
    }

    try {
      return new Date(
        date
      ).toLocaleDateString(
        "en-PH",
        {
          year: "numeric",
          month: "long",
          day: "numeric",
        }
      );
    } catch {
      return "—";
    }
  }

  // ============================================================
  // STATUS STYLE
  // ============================================================

  function getStatusStyle(
    status: string | null
  ) {
    const value =
      status?.toLowerCase() ||
      "pending";

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

  // ============================================================
  // FILTER
  // ============================================================

  const filteredApplications =
    useMemo(() => {
      const keyword =
        search
          .toLowerCase()
          .trim();

      return applications.filter(
        (application) => {
          const fullName =
            application.profile
              ?.full_name || "";

          const email =
            application.profile
              ?.email || "";

          const phone =
            application.profile
              ?.phone || "";

          const position =
            application.job
              ?.title || "";

          const location =
            application.job
              ?.location ||
            application.profile
              ?.location ||
            "";

          const status =
            application.status ||
            "Pending";

          const matchesSearch =
            !keyword ||
            fullName
              .toLowerCase()
              .includes(keyword) ||
            email
              .toLowerCase()
              .includes(keyword) ||
            phone
              .toLowerCase()
              .includes(keyword) ||
            position
              .toLowerCase()
              .includes(keyword) ||
            location
              .toLowerCase()
              .includes(keyword) ||
            status
              .toLowerCase()
              .includes(keyword);

          const matchesStatus =
            statusFilter ===
              "All" ||
            status.toLowerCase() ===
              statusFilter.toLowerCase();

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      applications,
      search,
      statusFilter,
    ]);

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">

      {/* ========================================================
          SIDEBAR
      ======================================================== */}

      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-60 bg-[#e30613] text-white lg:flex lg:flex-col">

        {/* LOGO */}

        <div className="flex h-24 items-center justify-center border-b border-white/15 px-5">

          <img
            src="/logo.png"
            alt="MR.DIY"
            className="max-h-16 w-auto object-contain"
          />

        </div>

        {/* MENU */}

        <nav className="flex-1 px-3 py-6">

          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Main Menu
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
            className="flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10"
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/jobs")
            }
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium hover:bg-white/10"
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
            onClick={
              handleLogout
            }
            className="w-full px-6 py-3 text-left text-sm font-medium hover:bg-white/10"
          >
            Logout
          </button>

        </div>

      </aside>

      {/* ========================================================
          MAIN
      ======================================================== */}

      <div className="lg:ml-60">

        {/* HEADER */}

        <header className="flex min-h-24 items-center border-b border-slate-200 bg-white px-6 lg:px-8">

          <div>

            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>

            <h1 className="mt-1 text-2xl font-bold text-slate-900">
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
              {applications.length}{" "}
              application
              {applications.length !==
              1
                ? "s"
                : ""}{" "}
              received
            </p>

          </section>

          {/* ERROR */}

          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">

              <p className="font-semibold">
                Error
              </p>

              <p className="mt-1">
                {error}
              </p>

            </div>
          )}

          {/* ======================================================
              SEARCH
          ====================================================== */}

          <section className="mb-6 border border-slate-200 bg-white p-4 shadow-sm">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

              <div>

                <h2 className="text-base font-bold text-slate-900">
                  Applicant Applications
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Search by applicant name, email, phone, position, location, or status.
                </p>

              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">

                {/* SEARCH */}

                <input
                  type="text"
                  value={search}
                  onChange={(e) =>
                    setSearch(
                      e.target.value
                    )
                  }
                  placeholder="Search applicant, position, location..."
                  className="w-full border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#e30613] sm:w-80"
                />

                {/* STATUS */}

                <select
                  value={
                    statusFilter
                  }
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value
                    )
                  }
                  className="border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#e30613]"
                >

                  <option value="All">
                    All Status
                  </option>

                  <option value="Pending">
                    Pending
                  </option>

                  <option value="Reviewed">
                    Reviewed
                  </option>

                  <option value="Approved">
                    Approved
                  </option>

                  <option value="Rejected">
                    Rejected
                  </option>

                </select>

                {(search ||
                  statusFilter !==
                    "All") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter(
                        "All"
                      );
                    }}
                    className="border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                )}

              </div>

            </div>

          </section>

          {/* ======================================================
              TABLE
          ====================================================== */}

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

            ) : filteredApplications.length ===
              0 ? (

              <div className="px-6 py-16 text-center">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl">
                  📋
                </div>

                <h3 className="mt-4 text-sm font-semibold text-slate-800">
                  {search ||
                  statusFilter !==
                    "All"
                    ? "No applications found"
                    : "No applications yet"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {search ||
                  statusFilter !==
                    "All"
                    ? "Try another search or filter."
                    : "Applications submitted by users will appear here."}
                </p>

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[1100px]">

                  <thead>

                    <tr className="border-b border-slate-200 bg-slate-50">

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Applicant
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Position
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Resume
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Match
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Action
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {filteredApplications.map(
                      (application) => {

                        const resumeUrl =
                          getResumeUrl(
                            application
                          );

                        return (
                          <tr
                            key={
                              application.id
                            }
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >

                            {/* APPLICANT */}

                            <td className="px-5 py-5">

                              <p className="text-sm font-bold text-slate-900">
                                {application
                                  .profile
                                  ?.full_name ||
                                  "Name not available"}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {application
                                  .profile
                                  ?.email ||
                                  "No email"}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                {application
                                  .profile
                                  ?.phone ||
                                  "No phone number"}
                              </p>

                            </td>

                            {/* POSITION */}

                            <td className="px-5 py-5">

                              <p className="max-w-xs text-sm font-medium text-slate-700">
                                {application
                                  .job
                                  ?.title ||
                                  "Position not available"}
                              </p>

                            </td>

                            {/* LOCATION */}

                            <td className="px-5 py-5">

                              <p className="text-sm text-slate-600">
                                {application
                                  .job
                                  ?.location ||
                                  application
                                    .profile
                                    ?.location ||
                                  "—"}
                              </p>

                            </td>

                            {/* RESUME */}

                            <td className="px-5 py-5">

                              {resumeUrl ? (

                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedApplication(
                                      application
                                    )
                                  }
                                  className="border border-[#e30613] px-4 py-2 text-xs font-semibold text-[#e30613] hover:bg-red-50"
                                >
                                  View Resume
                                </button>

                              ) : (

                                <span className="text-xs text-slate-400">
                                  No resume
                                </span>

                              )}

                            </td>

                            {/* MATCH */}

                            <td className="px-5 py-5">

                              {application.match_score !==
                              null ? (

                                <span className="inline-flex border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                                  {
                                    application.match_score
                                  }
                                  %
                                </span>

                              ) : (

                                <span className="text-xs text-slate-400">
                                  —
                                </span>

                              )}

                            </td>

                            {/* STATUS */}

                            <td className="px-5 py-5">

                              <span
                                className={`inline-flex border px-3 py-1 text-xs font-semibold ${getStatusStyle(
                                  application.status
                                )}`}
                              >
                                {application.status ||
                                  "Pending"}
                              </span>

                            </td>

                            {/* ACTION */}

                            <td className="px-5 py-5">

                              <div className="flex justify-end">

                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedApplication(
                                      application
                                    )
                                  }
                                  className="border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613]"
                                >
                                  Review
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

          </section>

          {/* FOOTER */}

          <footer className="mt-8 border-t border-slate-200 pt-5">

            <p className="text-xs text-slate-400">
              MR.DIY Careers Administration
            </p>

          </footer>

        </div>

      </div>

      {/* ========================================================
          APPLICATION REVIEW MODAL
      ======================================================== */}

      {selectedApplication && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">

          <div className="max-h-[95vh] w-full max-w-6xl overflow-y-auto bg-white shadow-2xl">

            {/* MODAL HEADER */}

            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">

              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  MR.DIY Careers
                </p>

                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  Application Review
                </h2>

              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedApplication(
                    null
                  )
                }
                className="flex h-10 w-10 items-center justify-center border border-slate-200 text-xl text-slate-500 hover:bg-slate-50"
              >
                ×
              </button>

            </div>

            <div className="p-6">

              {/* ==================================================
                  APPLICANT INFORMATION
              ================================================== */}

              <section className="border border-slate-200 p-6">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Applicant
                    </p>

                    <h3 className="mt-1 text-2xl font-bold text-slate-900">
                      {selectedApplication
                        .profile
                        ?.full_name ||
                        "Name not available"}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {selectedApplication
                        .profile
                        ?.email ||
                        "No email"}
                    </p>

                  </div>

                  <span
                    className={`inline-flex w-fit border px-3 py-1.5 text-xs font-semibold ${getStatusStyle(
                      selectedApplication.status
                    )}`}
                  >
                    {selectedApplication.status ||
                      "Pending"}
                  </span>

                </div>

                {/* DETAILS */}

                <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

                  {/* EMAIL */}

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Email
                    </p>

                    <p className="mt-1 break-all text-sm text-slate-700">
                      {selectedApplication
                        .profile
                        ?.email ||
                        "—"}
                    </p>

                  </div>

                  {/* PHONE */}

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Phone
                    </p>

                    {selectedApplication
                      .profile
                      ?.phone ? (

                      <a
                        href={`tel:${selectedApplication.profile.phone}`}
                        className="mt-1 block text-sm font-semibold text-[#e30613] hover:underline"
                      >
                        {
                          selectedApplication
                            .profile
                            .phone
                        }
                      </a>

                    ) : (

                      <p className="mt-1 text-sm text-slate-400">
                        No phone number
                      </p>

                    )}

                  </div>

                  {/* LOCATION */}

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Location
                    </p>

                    <p className="mt-1 text-sm text-slate-700">
                      {selectedApplication
                        .job
                        ?.location ||
                        selectedApplication
                          .profile
                          ?.location ||
                        "—"}
                    </p>

                  </div>

                  {/* POSITION */}

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Position Applied
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {selectedApplication
                        .job
                        ?.title ||
                        "—"}
                    </p>

                  </div>

                  {/* SALARY */}

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Salary
                    </p>

                    <p className="mt-1 text-sm text-slate-700">
                      {selectedApplication
                        .job
                        ?.salary ||
                        "—"}
                    </p>

                  </div>

                  {/* DATE */}

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Date Applied
                    </p>

                    <p className="mt-1 text-sm text-slate-700">
                      {formatDate(
                        selectedApplication.created_at
                      )}
                    </p>

                  </div>

                </div>

              </section>

              {/* ==================================================
                  RESUME
              ================================================== */}

              <section className="mt-6 border border-slate-200 p-6">

                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                  <div>

                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Resume
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-slate-900">
                      {selectedApplication
                        .profile
                        ?.resume_name ||
                        "Applicant Resume"}
                    </h3>

                    {selectedApplication
                      .profile
                      ?.resume_uploaded_at && (

                      <p className="mt-1 text-xs text-slate-500">
                        Uploaded{" "}
                        {formatDate(
                          selectedApplication
                            .profile
                            .resume_uploaded_at
                        )}
                      </p>

                    )}

                  </div>

                  {/* ==================================================
                      OPEN + DOWNLOAD
                  ================================================== */}

                  {getResumeUrl(
                    selectedApplication
                  ) && (

                    <div className="flex flex-wrap gap-2">

                      {/* OPEN FULL RESUME */}

                      <a
                        href={
                          getResumeUrl(
                            selectedApplication
                          ) || "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613]"
                      >
                        Open Full Resume
                      </a>

                      {/* DOWNLOAD RESUME */}

                      <a
                        href={
                          getResumeUrl(
                            selectedApplication
                          ) || "#"
                        }
                        download
                        className="bg-[#e30613] px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Download Resume
                      </a>

                    </div>

                  )}

                </div>

                {/* ==================================================
                    PDF PREVIEW
                ================================================== */}

                {getResumeUrl(
                  selectedApplication
                ) ? (

                  <div className="mt-6 overflow-hidden border border-slate-300 bg-slate-100">

                    <iframe
                      src={
                        getResumeUrl(
                          selectedApplication
                        ) || undefined
                      }
                      title="Applicant Resume"
                      className="h-[700px] w-full"
                    />

                  </div>

                ) : (

                  <div className="mt-6 border border-dashed border-slate-300 bg-slate-50 px-6 py-20 text-center">

                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-3xl">
                      📄
                    </div>

                    <h3 className="mt-4 text-sm font-bold text-slate-700">
                      No resume uploaded
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      This applicant does not have a resume available.
                    </p>

                  </div>

                )}

              </section>

              {/* ==================================================
                  STATUS
              ================================================== */}

              <section className="mt-6 border border-slate-200 p-6">

                <h3 className="text-lg font-bold text-slate-900">
                  Update Application Status
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Select the current status of this application.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">

                  {/* PENDING */}

                  <button
                    type="button"
                    disabled={
                      updating
                    }
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Pending"
                      )
                    }
                    className="border border-yellow-200 bg-yellow-50 px-5 py-4 text-sm font-semibold text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                  >
                    Pending
                  </button>

                  {/* REVIEWED */}

                  <button
                    type="button"
                    disabled={
                      updating
                    }
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Reviewed"
                      )
                    }
                    className="border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    Reviewed
                  </button>

                  {/* APPROVED */}

                  <button
                    type="button"
                    disabled={
                      updating
                    }
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Approved"
                      )
                    }
                    className="border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    Approved
                  </button>

                  {/* REJECTED */}

                  <button
                    type="button"
                    disabled={
                      updating
                    }
                    onClick={() =>
                      updateStatus(
                        selectedApplication.id,
                        "Rejected"
                      )
                    }
                    className="border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Rejected
                  </button>

                </div>

                {updating && (
                  <p className="mt-4 text-xs text-slate-500">
                    Updating application status...
                  </p>
                )}

              </section>

              {/* CLOSE */}

              <div className="mt-6 flex justify-end">

                <button
                  type="button"
                  onClick={() =>
                    setSelectedApplication(
                      null
                    )
                  }
                  className="border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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