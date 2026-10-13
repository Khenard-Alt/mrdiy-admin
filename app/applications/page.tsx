"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAlertsBell from "@/components/AdminAlertsBell";
import Sidebar from "@/components/Sidebar";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import ApplicantReview from "./ApplicantReview";
import InterviewPanel from "./InterviewPanel";
import RequirementsPanel from "./RequirementsPanel";
import ProfileDocumentsPanel from "./ProfileDocumentsPanel";
import ContractSignaturePanel from "./ContractSignaturePanel";
import ResignationPanel from "./ResignationPanel";
import AwolPanel from "./AwolPanel";
import ExitChecklistPanel from "./ExitChecklistPanel";
import RankingPanel from "./RankingPanel";
import HandoffPanel from "./HandoffPanel";
import NotesPanel from "./NotesPanel";
import {
  normalizeStatus,
  SETTABLE_STATUSES,
  statusClasses,
  statusLabel,
  STATUS_VALUES,
} from "@/lib/pipeline";

type Application = {
  id: string;
  user_id: string | null;
  job_id: string | null;
  resume_url: string | null;
  status: string | null;
  match_score: number | null;
  created_at: string | null;
  updated_at: string | null;
  assigned_to: string | null;
  branch_id: string | null;
  tags: string[];
  transfer_status: string;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  resignation_date?: string | null;
  last_working_day?: string | null;
  actual_last_day?: string | null;
  final_pay_released_at?: string | null;
  awol_absence_since?: string | null;
  awol_notice1_sent_at?: string | null;
  awol_explanation_deadline?: string | null;
  awol_explanation_received_at?: string | null;
  awol_explanation_text?: string | null;
};

type Assignee = {
  id: string;
  full_name: string | null;
  username: string;
};

type Branch = {
  id: string;
  name: string;
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
  assignee: Assignee | null;
  branch: Branch | null;
  transferOfferBranch: Branch | null;
};

export default function ApplicationsPage() {
  const router = useRouter();

  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentAdminId, setCurrentAdminId] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [queueFilter, setQueueFilter] = useState<"all" | "mine" | "unassigned">("all");

  const [selectedApplication, setSelectedApplication] =
    useState<ApplicationRow | null>(null);

  const [updating, setUpdating] = useState(false);
  const [markingPay, setMarkingPay] = useState(false);
  const [actualLastDayInput, setActualLastDayInput] = useState("");
  const [confirmingLastDay, setConfirmingLastDay] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{
    status: "sent" | "failed" | "invalid" | "not_configured";
    to: string | null;
    error?: string;
  } | null>(null);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [emailCheck, setEmailCheck] = useState<{
    state: "idle" | "checking" | "ok" | "failed" | "not_configured";
    message?: string;
  }>({ state: "idle" });

  // Connects to the mail server and logs in, without sending an email.
  async function checkEmailSetup() {
    setEmailCheck({ state: "checking" });
    try {
      const response = await fetch("/api/email/verify");
      const data = await response.json();
      if (!data.configured) {
        setEmailCheck({ state: "not_configured" });
      } else if (data.ok) {
        setEmailCheck({ state: "ok", message: data.from });
      } else {
        setEmailCheck({ state: "failed", message: data.error });
      }
    } catch {
      setEmailCheck({ state: "failed", message: "Could not reach the server." });
    }
  }

  // ============================================================
  // LOAD APPLICATIONS
  // ============================================================

  async function loadApplications() {
    setLoading(true);
    setError("");

    try {
      const [meResponse, response] = await Promise.all([fetch("/api/me"), fetch("/api/applications")]);

      if (response.status === 401 || meResponse.status === 401) {
        router.push("/login");
        return;
      }

      const me = await meResponse.json().catch(() => ({}));
      setCurrentAdminId(me.session?.id ?? "");

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load applications.");
      }

      const data = await response.json();
      setApplications((data.applications ?? []) as ApplicationRow[]);
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeRefresh(["applications"], loadApplications);

  // Deep link from elsewhere (e.g. the Interview Calendar's "ready to
  // interview" queue): /applications?open=<id> opens that application's
  // modal once it's loaded, then cleans the URL so a refresh doesn't reopen it.
  const [didOpenFromLink, setDidOpenFromLink] = useState(false);
  useEffect(() => {
    if (didOpenFromLink || applications.length === 0) return;
    const openId = new URLSearchParams(window.location.search).get("open");
    if (!openId) return;
    const match = applications.find((item) => item.id === openId);
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedApplication(match);
    }
    setDidOpenFromLink(true);
    window.history.replaceState(null, "", "/applications");
  }, [applications, didOpenFromLink]);

  // Keep the open modal in sync whenever the list reloads (manual refresh,
  // realtime signal, or a hand-off/transfer-offer action elsewhere).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedApplication((current) => {
      if (!current) return current;
      return applications.find((item) => item.id === current.id) ?? current;
    });
  }, [applications]);

  // ============================================================
  // RESUME URL
  // ============================================================

  // Pins the first signed URL seen per application, so the resume preview
  // <iframe> keeps a stable src across realtime-triggered reloads. Every
  // /api/applications fetch mints a fresh signed-url token for the same
  // file; without pinning, each refresh (triggered by any unrelated status
  // change, tag edit, hand-off...) changed the iframe's src, reloading it —
  // which browsers set to download PDFs instead of previewing them turned
  // into a repeated, unwanted download. A pinned URL stays valid for the
  // signed URL's full hour, which easily covers one review session.
  // Filled in an effect (never during render, which must stay pure) and
  // only read in getResumeUrl.
  const [resumeUrlCache, setResumeUrlCache] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResumeUrlCache((previous) => {
      let changed = false;
      const next = new Map(previous);
      for (const application of applications) {
        const live = application.resume_url || application.profile?.resume_url || null;
        if (live && !next.has(application.id)) {
          next.set(application.id, live);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [applications]);

  function getResumeUrl(
    application: ApplicationRow
  ) {
    // The /api/applications response already resolves stored paths to
    // signed URLs server-side (the "resumes" bucket is private).
    const live = application.resume_url || application.profile?.resume_url || null;
    return resumeUrlCache.get(application.id) ?? live;
  }

  /**
   * Browsers can preview a PDF inline (native viewer), but have no built-in
   * renderer for .docx/.doc — an <iframe> pointed at one just shows blank, or
   * the browser falls back to trying to download it. Only PDFs get the
   * inline <iframe> preview; anything else gets Open/Download plus a note.
   */
  function isPdfResume(application: ApplicationRow) {
    const url = getResumeUrl(application);
    if (!url) return false;
    return url.split("?")[0].toLowerCase().endsWith(".pdf");
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
    setEmailNotice(null);

    try {
      const response = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: applicationId, status: newStatus }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update application.");
      }

      if (data.warning) {
        throw new Error(data.warning);
      }

      setEmailNotice(data.email ?? null);
      setReviewVersion((version) => version + 1); // reload the review panel's email log

      // Update application list
      setApplications((current) =>
        current.map((item) =>
          item.id === applicationId
            ? {
                ...item,
                status: newStatus,
              }
            : item
        )
      );

      // Update selected application
      setSelectedApplication((current) =>
        current &&
        current.id === applicationId
          ? {
              ...current,
              status: newStatus,
            }
          : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update application."
      );
    } finally {
      setUpdating(false);
    }
  }

  async function confirmActualLastDay(applicationId: string, actualLastDay: string) {
    if (!actualLastDay) return;
    setConfirmingLastDay(true);
    setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: applicationId, actualLastDay }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save the actual last day.");

      setApplications((current) =>
        current.map((item) => (item.id === applicationId ? { ...item, actual_last_day: actualLastDay } : item))
      );
      setSelectedApplication((current) =>
        current && current.id === applicationId ? { ...current, actual_last_day: actualLastDay } : current
      );
      setActualLastDayInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the actual last day.");
    } finally {
      setConfirmingLastDay(false);
    }
  }

  async function markFinalPayReleased(applicationId: string) {
    setMarkingPay(true);
    setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: applicationId, markFinalPayReleased: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not mark final pay as released.");

      const releasedAt = new Date().toISOString();
      setApplications((current) =>
        current.map((item) =>
          item.id === applicationId ? { ...item, final_pay_released_at: releasedAt } : item
        )
      );
      setSelectedApplication((current) =>
        current && current.id === applicationId ? { ...current, final_pay_released_at: releasedAt } : current
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark final pay as released.");
    } finally {
      setMarkingPay(false);
    }
  }

  // ============================================================
  // ============================================================
  // DATE
  // ============================================================

  function formatDate(date: string | null) {
    if (!date) {
      return "—";
    }

    try {
      // e.g. "Oct 11, 2026, 10:45 PM" (the viewer's local time)
      return new Date(date).toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  // ============================================================
  // STATUS STYLE
  // ============================================================

  function getStatusStyle(status: string | null) {
    return statusClasses(status);
  }

  // ============================================================
  // FILTER
  // ============================================================

  const filteredApplications = useMemo(() => {
    const keyword = search.toLowerCase().trim();

    return applications.filter((application) => {
      const fullName =
        application.profile?.full_name || "";

      const email =
        application.profile?.email || "";

      const phone =
        application.profile?.phone || "";

      const applicantLocation =
        application.profile?.location || "";

      const position =
        application.job?.title || "";

      const jobLocation =
        application.job?.location || "";

      const status =
        statusLabel(application.status);

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
        applicantLocation
          .toLowerCase()
          .includes(keyword) ||
        position
          .toLowerCase()
          .includes(keyword) ||
        jobLocation
          .toLowerCase()
          .includes(keyword) ||
        status
          .toLowerCase()
          .includes(keyword);

      const matchesStatus =
        statusFilter === "All" ||
        normalizeStatus(application.status) === statusFilter;

      const matchesQueue =
        queueFilter === "all" ||
        (queueFilter === "mine" && application.assigned_to === currentAdminId) ||
        (queueFilter === "unassigned" && !application.assigned_to);

      return matchesSearch && matchesStatus && matchesQueue;
    });
  }, [
    applications,
    search,
    statusFilter,
    queueFilter,
    currentAdminId,
  ]);

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">

      <Sidebar active="/applications" />

      {/* ========================================================
          MAIN
      ======================================================== */}

      <div className="pt-14 lg:ml-60 lg:pt-0">

        {/* HEADER */}

        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Applications
            </h1>
          </div>
          <AdminAlertsBell />
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
              {applications.length !== 1
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

          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowRanking((value) => !value)}
              className="border border-[#e30613] px-4 py-2.5 text-xs font-semibold text-[#e30613] hover:bg-red-50"
            >
              {showRanking ? "Hide applicant ranking" : "Rank applicants by job"}
            </button>
          </div>

          {showRanking && (
            <RankingPanel
              onOpen={(applicationId) => {
                const match = applications.find((item) => item.id === applicationId);
                if (match) setSelectedApplication(match);
              }}
            />
          )}

          {/* QUEUE TABS */}
          <section className="mb-6 flex gap-2 border-b border-slate-200">
            {([
              ["all", "All"],
              ["mine", "My Queue"],
              ["unassigned", "Unassigned"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setQueueFilter(value)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  queueFilter === value
                    ? "border-[#e30613] text-[#e30613]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
                {value === "mine" && (
                  <span className="ml-1.5 text-xs text-slate-400">
                    ({applications.filter((a) => a.assigned_to === currentAdminId).length})
                  </span>
                )}
                {value === "unassigned" && (
                  <span className="ml-1.5 text-xs text-slate-400">
                    ({applications.filter((a) => !a.assigned_to).length})
                  </span>
                )}
              </button>
            ))}
          </section>

          <section className="mb-6 border border-slate-200 bg-white p-4 shadow-sm">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Applicant Applications
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Search by applicant name, email, phone, applicant location, job location, position, or status.
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">

                {/* SEARCH */}

                <input
                  type="text"
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  placeholder="Search applicant, location, position..."
                  className="w-full border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#e30613] sm:w-80"
                />

                {/* STATUS */}

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value)
                  }
                  className="border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#e30613]"
                >
                  <option value="All">
                    All Status
                  </option>

                  {STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value)}
                    </option>
                  ))}
                </select>

                {(search ||
                  statusFilter !== "All") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("All");
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
            ) : filteredApplications.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl">
                  📋
                </div>

                <h3 className="mt-4 text-sm font-semibold text-slate-800">
                  {search ||
                  statusFilter !== "All"
                    ? "No applications found"
                    : "No applications yet"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {search ||
                  statusFilter !== "All"
                    ? "Try another search or filter."
                    : "Applications submitted by users will appear here."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1350px]">

                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Applicant
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Position
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Applicant Location
                      </th>

                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Job Location
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
                            key={application.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >

                            {/* APPLICANT */}

                            <td className="px-5 py-5">
                              <p className="text-sm font-bold text-slate-900">
                                {application.profile
                                  ?.full_name ||
                                  "Name not available"}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {application.profile
                                  ?.email ||
                                  "No email"}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                {application.profile
                                  ?.phone ||
                                  "No phone number"}
                              </p>
                            </td>

                            {/* POSITION */}

                            <td className="px-5 py-5">
                              <p className="max-w-xs text-sm font-medium text-slate-700">
                                {application.job
                                  ?.title ||
                                  "Position not available"}
                              </p>
                            </td>

                            {/* APPLICANT LOCATION */}

                            <td className="px-5 py-5">
                              <p className="text-sm text-slate-600">
                                {application.profile
                                  ?.location ||
                                  "No applicant location"}
                              </p>
                            </td>

                            {/* JOB LOCATION */}

                            <td className="px-5 py-5">
                              <p className="text-sm text-slate-600">
                                {application.job
                                  ?.location ||
                                  "No job location"}
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
                                {statusLabel(application.status)}
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
                  setSelectedApplication(null)
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
                      {selectedApplication.profile
                        ?.full_name ||
                        "Name not available"}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {selectedApplication.profile
                        ?.email ||
                        "No email"}
                    </p>

                  </div>

                  <span
                    className={`inline-flex w-fit border px-3 py-1.5 text-xs font-semibold ${getStatusStyle(
                      selectedApplication.status
                    )}`}
                  >
                    {statusLabel(selectedApplication.status)}
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
                      {selectedApplication.profile
                        ?.email || "—"}
                    </p>
                  </div>

                  {/* PHONE */}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Phone
                    </p>

                    {selectedApplication.profile
                      ?.phone ? (
                      <a
                        href={`tel:${selectedApplication.profile.phone}`}
                        className="mt-1 block text-sm font-semibold text-[#e30613] hover:underline"
                      >
                        {
                          selectedApplication.profile
                            .phone
                        }
                      </a>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">
                        No phone number
                      </p>
                    )}
                  </div>

                  {/* APPLICANT LOCATION */}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Applicant Location
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {selectedApplication.profile
                        ?.location ||
                        "No applicant location"}
                    </p>
                  </div>

                  {/* POSITION */}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Position Applied
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {selectedApplication.job
                        ?.title || "—"}
                    </p>
                  </div>

                  {/* SALARY */}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Salary
                    </p>

                    <p className="mt-1 text-sm text-slate-700">
                      {selectedApplication.job
                        ?.salary || "—"}
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

                  {/* CONTRACT */}

                  {selectedApplication.contract_end_date && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Contract
                      </p>

                      <p className="mt-1 text-sm text-slate-700">
                        {formatDate(selectedApplication.contract_start_date ?? null)} –{" "}
                        {formatDate(selectedApplication.contract_end_date)}
                      </p>
                    </div>
                  )}

                </div>
              </section>

              {/* ==================================================
                  PICTURE, MATCH BREAKDOWN, HIGHLIGHTED RESUME TEXT
              ================================================== */}

              <ApplicantReview
                key={`${selectedApplication.id}-${reviewVersion}`}
                applicationId={selectedApplication.id}
              />

              {/* ==================================================
                  RESUME (ORIGINAL FILE, FOR DOUBLE-CHECKING)
              ================================================== */}

              <section className="mt-6 border border-slate-200 p-6">

                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Resume
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-slate-900">
                      {selectedApplication.profile
                        ?.resume_name ||
                        "Applicant Resume"}
                    </h3>

                    {selectedApplication.profile
                      ?.resume_uploaded_at && (
                      <p className="mt-1 text-xs text-slate-500">
                        Uploaded{" "}
                        {formatDate(
                          selectedApplication.profile
                            .resume_uploaded_at
                        )}
                      </p>
                    )}
                  </div>

                  {/* OPEN + DOWNLOAD */}

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

                {/* PDF PREVIEW */}

                {getResumeUrl(
                  selectedApplication
                ) && isPdfResume(selectedApplication) ? (
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
                ) : getResumeUrl(selectedApplication) ? (
                  <div className="mt-6 border border-dashed border-slate-300 bg-slate-50 px-6 py-20 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-3xl">
                      📝
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-slate-700">
                      Preview not available for this file type
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      This resume is a Word document (.docx) — browsers can&apos;t preview it inline. Use{" "}
                      <strong>Open Full Resume</strong> or <strong>Download Resume</strong> above instead.
                    </p>
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

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {SETTABLE_STATUSES.map((value) => {
                    const current =
                      normalizeStatus(selectedApplication.status) === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={updating}
                        onClick={() => updateStatus(selectedApplication.id, value)}
                        className={`border px-5 py-4 text-sm font-semibold disabled:opacity-50 ${statusClasses(
                          value
                        )} ${current ? "ring-2 ring-slate-900" : "hover:brightness-95"}`}
                      >
                        {statusLabel(value)}
                        {current && <span className="ml-2 text-xs font-normal">(current)</span>}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  The <strong>Interview Scheduled</strong> step is set by scheduling an interview below.
                  Every change notifies the applicant in the app and by email.
                </p>

                {updating && (
                  <p className="mt-4 text-xs text-slate-500">
                    Updating application status...
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={checkEmailSetup}
                    disabled={emailCheck.state === "checking"}
                    className="border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613] disabled:opacity-50"
                  >
                    {emailCheck.state === "checking" ? "Checking…" : "Check email setup"}
                  </button>
                  {emailCheck.state === "ok" && (
                    <span className="font-semibold text-green-700">
                      Email is ready. Emails are sent from {emailCheck.message}.
                    </span>
                  )}
                  {emailCheck.state === "not_configured" && (
                    <span className="font-semibold text-amber-800">
                      Not set up: add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS to .env.local, then restart.
                    </span>
                  )}
                  {emailCheck.state === "failed" && (
                    <span className="font-semibold text-red-700">
                      Email setup problem: {emailCheck.message}
                    </span>
                  )}
                </div>

                {!updating && emailNotice && (
                  <p
                    className={`mt-4 border px-4 py-3 text-xs font-semibold ${
                      emailNotice.status === "sent"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {emailNotice.status === "sent" &&
                      `Email sent to ${emailNotice.to}. The applicant was also notified in the app.`}
                    {emailNotice.status === "invalid" &&
                      `Email not sent: ${emailNotice.error ?? "invalid address"}${
                        emailNotice.to ? ` (${emailNotice.to})` : ""
                      } The applicant was still notified in the app.`}
                    {emailNotice.status === "failed" &&
                      `Email to ${emailNotice.to ?? "the applicant"} failed: ${emailNotice.error ?? "unknown error"}. The applicant was still notified in the app.`}
                    {emailNotice.status === "not_configured" &&
                      "Email is not set up yet (add SMTP settings to .env.local). The applicant was notified in the app only."}
                  </p>
                )}

              </section>

              {/* ==================================================
                  HAND-OFF
              ================================================== */}

              <HandoffPanel
                key={`${selectedApplication.id}-handoff`}
                applicationId={selectedApplication.id}
                assignedTo={selectedApplication.assigned_to}
                assigneeName={selectedApplication.assignee?.full_name ?? selectedApplication.assignee?.username ?? null}
                branchId={selectedApplication.branch_id}
                branchName={selectedApplication.branch?.name ?? null}
                currentAdminId={currentAdminId}
                transferStatus={selectedApplication.transfer_status}
                transferOfferBranchName={selectedApplication.transferOfferBranch?.name ?? null}
                onAssigned={(assignedTo) => {
                  setApplications((current) =>
                    current.map((item) =>
                      item.id === selectedApplication.id ? { ...item, assigned_to: assignedTo } : item
                    )
                  );
                  setSelectedApplication((current) =>
                    current && current.id === selectedApplication.id ? { ...current, assigned_to: assignedTo } : current
                  );
                }}
                onTransferOffered={() => {
                  loadApplications();
                }}
              />

              {/* ==================================================
                  NOTES & TAGS
              ================================================== */}

              <NotesPanel
                key={`${selectedApplication.id}-notes`}
                applicationId={selectedApplication.id}
                tags={selectedApplication.tags ?? []}
                onTagsChange={(tags) => {
                  setApplications((current) =>
                    current.map((item) => (item.id === selectedApplication.id ? { ...item, tags } : item))
                  );
                  setSelectedApplication((current) =>
                    current && current.id === selectedApplication.id ? { ...current, tags } : current
                  );
                }}
              />

              {/* ==================================================
                  INTERVIEW
              ================================================== */}

              <InterviewPanel
                key={selectedApplication.id}
                applicationId={selectedApplication.id}
                defaultVenue={selectedApplication.branch?.name ?? selectedApplication.job?.location ?? ""}
                onStatusChange={(newStatus) => {
                  setApplications((current) =>
                    current.map((item) =>
                      item.id === selectedApplication.id ? { ...item, status: newStatus } : item
                    )
                  );
                  setSelectedApplication((current) =>
                    current && current.id === selectedApplication.id ? { ...current, status: newStatus } : current
                  );
                  setReviewVersion((version) => version + 1);
                }}
              />

              {/* ==================================================
                  PROFILE DOCUMENTS (valid ID + requirements, any stage)
              ================================================== */}

              {selectedApplication.user_id && (
                <ProfileDocumentsPanel
                  key={`${selectedApplication.id}-profile-docs-${reviewVersion}`}
                  userId={selectedApplication.user_id}
                />
              )}

              {/* ==================================================
                  EMPLOYMENT CONTRACT (Hired + Contractual job only)
              ================================================== */}

              {normalizeStatus(selectedApplication.status) === "Hired" &&
                selectedApplication.contract_start_date &&
                selectedApplication.contract_end_date && (
                  <ContractSignaturePanel
                    key={`${selectedApplication.id}-contract-${reviewVersion}`}
                    applicationId={selectedApplication.id}
                    applicantName={selectedApplication.profile?.full_name || "the employee"}
                    jobTitle={selectedApplication.job?.title || "this position"}
                    branchName={selectedApplication.branch?.name ?? null}
                    contractStartDate={selectedApplication.contract_start_date}
                    contractEndDate={selectedApplication.contract_end_date}
                  />
                )}

              {/* ==================================================
                  PRE-EMPLOYMENT DOCUMENTS (after Hired)
              ================================================== */}

              {normalizeStatus(selectedApplication.status) === "Hired" && (
                <RequirementsPanel
                  key={`${selectedApplication.id}-requirements-${reviewVersion}`}
                  applicationId={selectedApplication.id}
                />
              )}

              {/* ==================================================
                  RESIGNATION (Hired only — records a voluntary exit)
              ================================================== */}

              {normalizeStatus(selectedApplication.status) === "Hired" && (
                <ResignationPanel
                  key={`${selectedApplication.id}-resign-${reviewVersion}`}
                  applicationId={selectedApplication.id}
                  onResigned={(lastWorkingDay) => {
                    setApplications((current) =>
                      current.map((item) =>
                        item.id === selectedApplication.id
                          ? { ...item, status: "Resigned", last_working_day: lastWorkingDay }
                          : item
                      )
                    );
                    setSelectedApplication((current) =>
                      current && current.id === selectedApplication.id
                        ? { ...current, status: "Resigned", last_working_day: lastWorkingDay }
                        : current
                    );
                    setReviewVersion((version) => version + 1);
                  }}
                />
              )}

              {/* ==================================================
                  AWOL / TERMINATION (Hired only — twin-notice due process)
              ================================================== */}

              {normalizeStatus(selectedApplication.status) === "Hired" && (
                <AwolPanel
                  key={`${selectedApplication.id}-awol-${reviewVersion}`}
                  applicationId={selectedApplication.id}
                  absenceSince={selectedApplication.awol_absence_since ?? null}
                  notice1SentAt={selectedApplication.awol_notice1_sent_at ?? null}
                  explanationDeadline={selectedApplication.awol_explanation_deadline ?? null}
                  explanationReceivedAt={selectedApplication.awol_explanation_received_at ?? null}
                  explanationText={selectedApplication.awol_explanation_text ?? null}
                  onStatusChange={(newStatus) => {
                    setApplications((current) =>
                      current.map((item) =>
                        item.id === selectedApplication.id ? { ...item, status: newStatus } : item
                      )
                    );
                    setSelectedApplication((current) =>
                      current && current.id === selectedApplication.id ? { ...current, status: newStatus } : current
                    );
                    setReviewVersion((version) => version + 1);
                  }}
                  onCleared={() => setReviewVersion((version) => version + 1)}
                />
              )}

              {/* ==================================================
                  EXIT CHECKLIST (Resigned or Terminated)
              ================================================== */}

              {(normalizeStatus(selectedApplication.status) === "Resigned" ||
                normalizeStatus(selectedApplication.status) === "Terminated") && (
                <>
                  <ExitChecklistPanel
                    key={`${selectedApplication.id}-exit-${reviewVersion}`}
                    applicationId={selectedApplication.id}
                    onCleared={() => setReviewVersion((version) => version + 1)}
                  />

                  <section className="mt-6 border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900">Actual Last Day Worked</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      The planned last working day is {formatDate(selectedApplication.last_working_day ?? null)}.
                      Confirm the real last day once you know it — it can be earlier if the employee stopped
                      reporting before completing the notice period.
                    </p>

                    {selectedApplication.actual_last_day ? (
                      <div className="mt-4">
                        <p className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                          Confirmed: {formatDate(selectedApplication.actual_last_day)}
                        </p>
                        {selectedApplication.last_working_day &&
                          selectedApplication.actual_last_day < selectedApplication.last_working_day && (
                            <p className="mt-2 inline-flex border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                              Incomplete notice — stopped {Math.round(
                                (new Date(selectedApplication.last_working_day).getTime() -
                                  new Date(selectedApplication.actual_last_day).getTime()) /
                                  (1000 * 60 * 60 * 24)
                              )} day(s) early
                            </p>
                          )}
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap items-end gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Actual last day
                          </label>
                          <input
                            type="date"
                            value={actualLastDayInput}
                            onChange={(event) => setActualLastDayInput(event.target.value)}
                            className="border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e30613]"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={confirmingLastDay || !actualLastDayInput}
                          onClick={() => confirmActualLastDay(selectedApplication.id, actualLastDayInput)}
                          className="border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {confirmingLastDay ? "Saving…" : "Confirm actual last day"}
                        </button>
                      </div>
                    )}
                  </section>

                  <section className="mt-6 border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900">Final Pay</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Must be released within 30 days of the real last working day (
                      {formatDate(selectedApplication.actual_last_day ?? selectedApplication.last_working_day ?? null)}
                      ), per DOLE Labor Advisory 06-20.
                    </p>

                    {selectedApplication.final_pay_released_at ? (
                      <p className="mt-4 border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
                        Released on {formatDate(selectedApplication.final_pay_released_at ?? null)}.
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={markingPay}
                        onClick={() => markFinalPayReleased(selectedApplication.id)}
                        className="mt-4 bg-[#e30613] px-5 py-3 text-sm font-semibold text-white hover:bg-[#c80511] disabled:opacity-50"
                      >
                        {markingPay ? "Saving…" : "Mark final pay as released"}
                      </button>
                    )}
                  </section>
                </>
              )}

              {/* CLOSE */}

              <div className="mt-6 flex justify-end">

                <button
                  type="button"
                  onClick={() =>
                    setSelectedApplication(null)
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