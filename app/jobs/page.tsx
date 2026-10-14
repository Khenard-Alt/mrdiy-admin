"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAlertsBell from "@/components/AdminAlertsBell";
import Sidebar from "@/components/Sidebar";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

type Job = {
  id: string;
  title: string | null;
  description: string | null;
  location: string | null;
  salary: string | null;
  status: string | null;
  created_at: string | null;
  salary_type: string | null;
  responsibilities: string | null;
  requirements: string | null;
  benefits: string | null;
  job_type?: string | null;
  category?: string | null;
  level?: string | null;
  openings: number | null;
  deadline: string | null;
  branch_id: string | null;
  contract_duration_months?: number | null;
  filled?: number;
  closedReason?: "filled" | "deadline" | null;
};

type Branch = {
  id: string;
  name: string;
};

type JobForm = {
  title: string;
  description: string;
  responsibilities: string;
  requirements: string;
  benefits: string;
  location: string;
  salary: string;
  salary_type: string;
  status: string;
  jobType: string;
  category: string;
  level: string;
  openings: string;
  deadline: string;
  branchId: string;
  contractDurationMonths: string;
};

type GeneratorResult = {
  draft: {
    aboutRole: string;
    responsibilities: string[];
    requirements: string[];
    benefits: string[];
  };
  basedOn: { id: string; title: string; similarity: number }[];
  coldStart: boolean;
  warnings: { message: string }[];
  source: "layer1-retrieval" | "layer3-gemini" | "layer2-generic";
  geminiUnavailable?: string;
  geminiAttemptRejected?: { message: string }[];
};

const SOURCE_BADGE: Record<GeneratorResult["source"], { label: string; className: string }> = {
  "layer1-retrieval": {
    label: "Generated from existing postings",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "layer3-gemini": {
    label: "Written by Gemini — no similar role yet",
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  "layer2-generic": {
    label: "No similar posting found — generic draft",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const emptyForm: JobForm = {
  title: "",
  description: "",
  responsibilities: "",
  requirements: "",
  benefits: "",
  location: "",
  salary: "",
  salary_type: "Monthly",
  status: "published",
  jobType: "Full-time",
  category: "",
  level: "",
  openings: "",
  deadline: "",
  branchId: "",
  contractDurationMonths: "",
};

const JOBS_PER_PAGE = 10;

export default function JobsPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const [form, setForm] = useState<JobForm>({
    ...emptyForm,
  });

  const [generating, setGenerating] = useState(false);
  const [generatorError, setGeneratorError] = useState("");
  const [generatorResult, setGeneratorResult] = useState<GeneratorResult | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  useRealtimeRefresh(["jobs"], loadJobs);

  async function loadJobs() {
    setLoading(true);
    setError("");
    setForbidden(false);

    try {
      const response = await fetch("/api/jobs");

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (response.status === 403) {
        setForbidden(true);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load jobs.");
      }

      const data = await response.json();
      setJobs((data.jobs ?? []) as Job[]);

      const branchesResponse = await fetch("/api/branches");
      if (branchesResponse.ok) {
        const branchesData = await branchesResponse.json();
        setBranches(branchesData.branches ?? []);
      }
    } catch (err) {
      console.error("Load jobs error:", err);
      setError(err instanceof Error ? err.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingJob(null);

    setForm({
      ...emptyForm,
    });

    setError("");
    setSuccess("");
    setGeneratorResult(null);
    setGeneratorError("");
    setShowModal(true);
  }

  function openEditModal(job: Job) {
    setEditingJob(job);

    setForm({
      title: job.title ?? "",
      description: job.description ?? "",
      responsibilities: job.responsibilities ?? "",
      requirements: job.requirements ?? "",
      benefits: job.benefits ?? "",
      location: job.location ?? "",
      salary: job.salary ?? "",
      salary_type: job.salary_type ?? "Monthly",
      status: job.status ?? "published",
      jobType: job.job_type && job.job_type !== "Not specified" ? job.job_type : "Full-time",
      category: job.category && job.category !== "Not specified" ? job.category : "",
      level: job.level && job.level !== "Not specified" ? job.level : "",
      openings: job.openings?.toString() ?? "",
      deadline: job.deadline ?? "",
      branchId: job.branch_id ?? "",
      contractDurationMonths: job.contract_duration_months?.toString() ?? "",
    });

    setError("");
    setSuccess("");
    setGeneratorResult(null);
    setGeneratorError("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingJob(null);

    setForm({
      ...emptyForm,
    });

    setError("");
    setGeneratorResult(null);
    setGeneratorError("");
  }

  function updateForm(field: keyof JobForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /** Phase 1+2 of the AI Job Description Generator (CAPSTONE_ADVANCED_AI_PLANNING.md §5). */
  async function handleGenerateDescription() {
    if (!form.title.trim()) {
      setGeneratorError("Enter a job title first.");
      return;
    }

    setGenerating(true);
    setGeneratorError("");
    setGeneratorResult(null);

    try {
      const response = await fetch("/api/jobs/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category || null,
          level: form.level || null,
          branchId: form.branchId || null,
          contractDurationMonths: form.contractDurationMonths ? Number(form.contractDurationMonths) : null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not generate a description.");

      setGeneratorResult(data as GeneratorResult);
    } catch (err) {
      setGeneratorError(err instanceof Error ? err.message : "Could not generate a description.");
    } finally {
      setGenerating(false);
    }
  }

  /** Fills the form with the generated draft — HR still reviews and edits before saving (Layer 4). */
  function applyGeneratedDraft() {
    if (!generatorResult) return;
    const { draft } = generatorResult;
    setForm((current) => ({
      ...current,
      description: draft.aboutRole,
      responsibilities: draft.responsibilities.join("\n"),
      requirements: draft.requirements.join("\n"),
      benefits: draft.benefits.join("\n"),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.title.trim()) {
      setError("Job title is required.");
      return;
    }

    if (!form.location.trim()) {
      setError("Location is required.");
      return;
    }

    setSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      responsibilities: form.responsibilities.trim(),
      requirements: form.requirements.trim(),
      benefits: form.benefits.trim(),
      location: form.location.trim(),
      salary: form.salary.trim(),
      salary_type: form.salary_type,
      status: form.status,
      jobType: form.jobType,
      category: form.category.trim(),
      level: form.level.trim(),
      openings: form.openings ? Number(form.openings) : null,
      deadline: form.deadline || null,
      branchId: form.branchId || null,
      contractDurationMonths:
        form.jobType === "Contractual" && form.contractDurationMonths
          ? Number(form.contractDurationMonths)
          : null,
    };

    /*
     * EDIT EXISTING JOB
     */
    if (editingJob) {
      const response = await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingJob.id, ...payload }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("Update job error:", data.error);

        setError(`Failed to update job: ${data.error ?? "Unknown error"}`);

        setSaving(false);
        return;
      }

      setSuccess("Job updated successfully.");
    }

    /*
     * CREATE NEW JOB
     */
    else {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("Create job error:", data.error);

        setError(`Failed to create job: ${data.error ?? "Unknown error"}`);

        setSaving(false);
        return;
      }

      setSuccess("Job created successfully.");
    }

    setSaving(false);

    setShowModal(false);
    setEditingJob(null);

    setForm({
      ...emptyForm,
    });

    setGeneratorResult(null);
    setGeneratorError("");

    await loadJobs();
  }

  async function handleDelete(job: Job) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${job.title ?? "this job"}"?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    const response = await fetch(`/api/jobs?id=${encodeURIComponent(job.id)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error("Delete job error:", data.error);

      setError(`Failed to delete job: ${data.error ?? "Unknown error"}`);

      return;
    }

    setSuccess("Job deleted successfully.");

    await loadJobs();
  }

  async function handleDuplicate(job: Job) {
    setError("");
    setSuccess("");

    const targetBranchId = branches.length > 0 ? window.prompt(
      `Duplicate "${job.title}" to which branch?\n\n` +
        branches.map((b, i) => `${i + 1}. ${b.name}`).join("\n") +
        "\n\nEnter the number, or leave blank for no branch:"
    ) : null;

    const branch = targetBranchId
      ? branches[Number(targetBranchId) - 1]
      : undefined;

    const response = await fetch("/api/jobs/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, branchId: branch?.id, location: branch?.name }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(`Failed to duplicate job: ${data.error ?? "Unknown error"}`);
      return;
    }

    setSuccess("Job duplicated as a draft. Edit it to adjust details.");
    await loadJobs();
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

  function formatStatus(status: string | null) {
    if (!status) {
      return "Published";
    }

    const value = status.toLowerCase();

    if (value === "published") {
      return "Published";
    }

    if (value === "draft") {
      return "Draft";
    }

    if (value === "closed") {
      return "Closed";
    }

    if (value === "open") {
      return "Open";
    }

    return status;
  }

  function getStatusStyle(status: string | null) {
    const value = (status ?? "published").toLowerCase();

    if (
      value === "published" ||
      value === "open" ||
      value === "active"
    ) {
      return "border-green-200 bg-green-50 text-green-700";
    }

    if (value === "closed") {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (value === "draft") {
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    }

    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  const filteredJobs = jobs.filter((job) => {
    const searchText = search.toLowerCase().trim();

    if (!searchText) {
      return true;
    }

    return (
      (job.title ?? "")
        .toLowerCase()
        .includes(searchText) ||
      (job.location ?? "")
        .toLowerCase()
        .includes(searchText) ||
      (job.description ?? "")
        .toLowerCase()
        .includes(searchText) ||
      (job.status ?? "")
        .toLowerCase()
        .includes(searchText) ||
      (job.salary ?? "")
        .toLowerCase()
        .includes(searchText)
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredJobs.length / JOBS_PER_PAGE)
  );
  // Clamp so deleting the last job on a page doesn't leave an empty page.
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * JOBS_PER_PAGE;
  const pagedJobs = filteredJobs.slice(
    pageStart,
    pageStart + JOBS_PER_PAGE
  );

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <Sidebar active="/jobs" />

      {/* =========================
          MAIN CONTENT
      ========================== */}

      <div className="pt-14 lg:ml-60 lg:pt-0">
        {/* HEADER */}

        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Jobs
            </h1>
          </div>
          <AdminAlertsBell />
        </header>

        {/* PAGE CONTENT */}

        <div className="p-5 sm:p-6 lg:p-8">
          {forbidden ? (
            <div className="border border-slate-200 bg-white px-6 py-16 text-center">
              <h3 className="text-sm font-semibold text-slate-800">HR access required</h3>
              <p className="mt-1 text-sm text-slate-500">
                Job postings are managed by HR Officer and Super Admin accounts. Branch managers focus on applications
                and interviews for their own branch instead.
              </p>
            </div>
          ) : (
            <>
          {/* INTRO */}

          <section className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">
                Create and manage available job openings.
              </p>

              <p className="mt-2 text-xs font-medium text-slate-400">
                {jobs.length} total job
                {jobs.length !== 1 ? "s" : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="bg-[#e30613] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#c80511]"
            >
              + Add New Job
            </button>
          </section>

          {/* SUCCESS MESSAGE */}

          {success && !showModal && (
            <div className="mb-6 border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-700">
              {success}
            </div>
          )}

          {/* ERROR MESSAGE */}

          {error && !showModal && (
            <div className="mb-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SEARCH */}

          <section className="mb-6 border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Job Listings
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Search and manage your current postings.
                </p>
              </div>

              <div className="w-full sm:max-w-sm">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search jobs..."
                  className="w-full border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#e30613]"
                />
              </div>
            </div>
          </section>

          {/* JOB TABLE */}

          <section className="border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex min-h-64 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />

                  <p className="mt-4 text-sm text-slate-500">
                    Loading jobs...
                  </p>
                </div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <h3 className="text-sm font-semibold text-slate-800">
                  {search
                    ? "No jobs found"
                    : "No jobs available"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {search
                    ? "Try another search term."
                    : "Create a job posting to get started."}
                </p>

                {!search && (
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="mt-5 bg-[#e30613] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c80511]"
                  >
                    + Add New Job
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Position
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Salary
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Vacancy
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Date Posted
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {pagedJobs.map((job) => (
                      <tr
                        key={job.id}
                        className="border-b border-slate-100 last:border-0 transition hover:bg-slate-50"
                      >
                        {/* POSITION */}

                        <td className="px-5 py-4">
                          <div className="max-w-sm">
                            <p className="text-sm font-semibold text-slate-800">
                              {job.title ||
                                "Untitled Job"}
                            </p>

                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                              {job.description ||
                                "No description provided."}
                            </p>

                            {job.contract_duration_months && (
                              <p className="mt-1 text-[11px] font-medium text-amber-700">
                                Contract: {job.contract_duration_months} mo
                                {job.contract_duration_months !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* LOCATION */}

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {job.location || "—"}
                        </td>

                        {/* SALARY */}

                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-slate-700">
                            {job.salary || "—"}
                          </p>

                          {job.salary_type && (
                            <p className="mt-1 text-xs text-slate-400">
                              {job.salary_type}
                            </p>
                          )}
                        </td>

                        {/* VACANCY */}

                        <td className="px-5 py-4">
                          {job.openings ? (
                            <div className="w-24">
                              <p className="text-xs font-medium text-slate-600">
                                {job.filled ?? 0} / {job.openings}
                              </p>
                              <div className="mt-1 h-1.5 w-full bg-slate-100">
                                <div
                                  className={`h-1.5 ${
                                    (job.filled ?? 0) >= job.openings
                                      ? "bg-green-500"
                                      : "bg-[#e30613]"
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      ((job.filled ?? 0) / job.openings) * 100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </td>

                        {/* STATUS */}

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${getStatusStyle(
                              job.status
                            )}`}
                          >
                            {formatStatus(job.status)}
                          </span>

                          {job.closedReason && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {job.closedReason === "filled"
                                ? "Filled"
                                : "Deadline passed"}
                            </p>
                          )}
                        </td>

                        {/* DATE */}

                        <td className="px-5 py-4 text-sm text-slate-500">
                          {formatDate(job.created_at)}
                        </td>

                        {/* ACTIONS */}

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openEditModal(job)
                              }
                              className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#e30613] hover:text-[#e30613]"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDuplicate(job)}
                              className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#e30613] hover:text-[#e30613]"
                            >
                              Duplicate
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDelete(job)
                              }
                              className="border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* PAGINATION */}

            {!loading && filteredJobs.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Showing {pageStart + 1}–
                  {pageStart + pagedJobs.length} of{" "}
                  {filteredJobs.length} jobs
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
                  >
                    Previous
                  </button>

                  <span className="px-2 text-xs font-medium text-slate-600">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#e30613] hover:text-[#e30613] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* FOOTER */}

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-400">
              MR.DIY Careers Administration
            </p>
          </footer>
            </>
          )}
        </div>
      </div>

      {/* =========================
          ADD / EDIT MODAL
      ========================== */}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
            {/* MODAL HEADER */}

            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  MR.DIY Careers
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {editingJob
                    ? "Edit Job"
                    : "Add New Job"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="flex h-9 w-9 items-center justify-center border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
              >
                ×
              </button>
            </div>

            {/* FORM */}

            <form
              onSubmit={handleSubmit}
              className="p-6"
            >
              {/* ERROR */}

              {error && (
                <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* JOB TITLE */}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Job Title *
                </label>

                <input
                  type="text"
                  value={form.title}
                  onChange={(event) =>
                    updateForm(
                      "title",
                      event.target.value
                    )
                  }
                  placeholder="e.g. Store Associate"
                  required
                  className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                />
              </div>

              {/* LOCATION */}

              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Location *
                </label>

                <input
                  type="text"
                  value={form.location}
                  onChange={(event) =>
                    updateForm(
                      "location",
                      event.target.value
                    )
                  }
                  placeholder="e.g. Antipolo City"
                  required
                  list="branch-locations"
                  autoComplete="off"
                  className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                />

                <datalist id="branch-locations">
                  {[...new Set(branches.map((branch) => branch.name))].map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                <p className="mt-1 text-xs text-slate-400">
                  Start typing to search existing branches, or enter a new location.
                </p>
              </div>

              {/* SALARY + SALARY TYPE */}

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Salary
                  </label>

                  <input
                    type="text"
                    value={form.salary}
                    onChange={(event) =>
                      updateForm(
                        "salary",
                        event.target.value
                      )
                    }
                    placeholder="e.g. ₱15,000"
                    className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Salary Type
                  </label>

                  <select
                    value={form.salary_type}
                    onChange={(event) =>
                      updateForm(
                        "salary_type",
                        event.target.value
                      )
                    }
                    className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  >
                    <option value="Monthly">
                      Monthly
                    </option>

                    <option value="Daily">
                      Daily
                    </option>

                    <option value="Hourly">
                      Hourly
                    </option>

                    <option value="Annual">
                      Annual
                    </option>
                  </select>
                </div>
              </div>

              {/* STATUS */}

              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Status
                </label>

                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm(
                      "status",
                      event.target.value
                    )
                  }
                  className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                >
                  <option value="published">
                    Published
                  </option>

                  <option value="draft">
                    Draft
                  </option>

                  <option value="closed">
                    Closed
                  </option>
                </select>
              </div>

              {/* JOB TYPE / CATEGORY / LEVEL */}

              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Job Type</label>
                  <select
                    value={form.jobType}
                    onChange={(event) => updateForm("jobType", event.target.value)}
                    className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contractual">Contractual</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Category</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    placeholder="e.g. Retail"
                    className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Level</label>
                  <input
                    type="text"
                    value={form.level}
                    onChange={(event) => updateForm("level", event.target.value)}
                    placeholder="e.g. Entry Level"
                    className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />
                </div>
              </div>

              {/* OPENINGS / DEADLINE / BRANCH */}

              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Openings</label>
                  <input
                    type="number"
                    min={1}
                    value={form.openings}
                    onChange={(event) => updateForm("openings", event.target.value)}
                    placeholder="e.g. 2"
                    className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />
                  <p className="mt-1 text-xs text-slate-400">Auto-closes once this many are Hired.</p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(event) => updateForm("deadline", event.target.value)}
                    className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />
                  <p className="mt-1 text-xs text-slate-400">Auto-closes after this date.</p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Branch</label>
                  <select
                    value={form.branchId}
                    onChange={(event) => updateForm("branchId", event.target.value)}
                    className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  >
                    <option value="">No branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CONTRACT DURATION (contractual jobs only) */}

              {form.jobType === "Contractual" && (
                <div className="mt-5 sm:w-1/3">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Contract Duration (months)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.contractDurationMonths}
                    onChange={(event) => updateForm("contractDurationMonths", event.target.value)}
                    placeholder="e.g. 5"
                    className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    When an applicant is Hired, their contract end date is set to this many months
                    from the hire date.
                  </p>
                </div>
              )}

              {/* DESCRIPTION */}

              <div className="mt-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Job Description
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={generating}
                    className="border border-[#e30613] px-3 py-1.5 text-xs font-semibold text-[#e30613] hover:bg-red-50 disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "✨ Generate description"}
                  </button>
                </div>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm(
                      "description",
                      event.target.value
                    )
                  }
                  placeholder="Enter the job description..."
                  rows={6}
                  className="w-full resize-none border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                />

                {generatorError && (
                  <p className="mt-2 text-xs font-semibold text-red-600">{generatorError}</p>
                )}

                {generatorResult && (
                  <div className="mt-3 border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${SOURCE_BADGE[generatorResult.source].className}`}
                      >
                        {SOURCE_BADGE[generatorResult.source].label}
                      </span>
                      <button
                        type="button"
                        onClick={applyGeneratedDraft}
                        className="bg-[#e30613] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#c80511]"
                      >
                        Use this draft
                      </button>
                    </div>

                    {generatorResult.basedOn.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">Based on:</span>{" "}
                        {generatorResult.basedOn
                          .map((item) => `${item.title} (${item.similarity}% similar)`)
                          .join(", ")}
                      </p>
                    )}

                    {generatorResult.geminiUnavailable && (
                      <p className="mt-2 text-xs text-slate-500">
                        Gemini wasn&apos;t used ({generatorResult.geminiUnavailable}) — showing a generic draft instead.
                      </p>
                    )}

                    {generatorResult.geminiAttemptRejected && (
                      <div className="mt-2 text-xs text-slate-500">
                        <p>Gemini&apos;s draft didn&apos;t pass the compliance check, so a generic draft is shown instead:</p>
                        <ul className="mt-1 space-y-0.5">
                          {generatorResult.geminiAttemptRejected.map((warning, index) => (
                            <li key={index}>— {warning.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {generatorResult.warnings.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {generatorResult.warnings.map((warning, index) => (
                          <li key={index} className="text-xs font-semibold text-red-600">
                            ⚠ {warning.message}
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="mt-3 text-xs italic text-slate-500">
                      {generatorResult.draft.aboutRole}
                    </p>
                  </div>
                )}
              </div>

              {/* RESPONSIBILITIES / REQUIREMENTS / BENEFITS (one item per line) */}

              {(
                [
                  ["responsibilities", "Responsibilities"],
                  ["requirements", "Requirements / Qualifications"],
                  ["benefits", "Benefits"],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="mt-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    {label}
                  </label>

                  <textarea
                    value={form[field]}
                    onChange={(event) =>
                      updateForm(field, event.target.value)
                    }
                    placeholder="One item per line"
                    rows={5}
                    className="w-full resize-none border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                  />

                  <p className="mt-1 text-xs text-slate-400">
                    Type one item per line. Each line is shown as a bullet to applicants.
                  </p>
                </div>
              ))}

              {/* BUTTONS */}

              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#e30613] px-6 py-3 text-sm font-semibold text-white hover:bg-[#c80511] disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingJob
                      ? "Save Changes"
                      : "Create Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}