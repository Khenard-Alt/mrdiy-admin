"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Job = {
  id: string;
  title: string | null;
  description: string | null;
  location: string | null;
  salary: string | null;
  status: string | null;
  created_at: string | null;
  salary_type: string | null;
};

type JobForm = {
  title: string;
  description: string;
  location: string;
  salary: string;
  salary_type: string;
  status: string;
};

const emptyForm: JobForm = {
  title: "",
  description: "",
  location: "",
  salary: "",
  salary_type: "Monthly",
  status: "published",
};

export default function JobsPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const [form, setForm] = useState<JobForm>({
    ...emptyForm,
  });

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/jobs");

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load jobs.");
      }

      const data = await response.json();
      setJobs((data.jobs ?? []) as Job[]);
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
    setShowModal(true);
  }

  function openEditModal(job: Job) {
    setEditingJob(job);

    setForm({
      title: job.title ?? "",
      description: job.description ?? "",
      location: job.location ?? "",
      salary: job.salary ?? "",
      salary_type: job.salary_type ?? "Monthly",
      status: job.status ?? "published",
    });

    setError("");
    setSuccess("");
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
  }

  function updateForm(field: keyof JobForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
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
      location: form.location.trim(),
      salary: form.salary.trim(),
      salary_type: form.salary_type,
      status: form.status,
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

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
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

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      {/* =========================
          SIDEBAR
      ========================== */}

      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-60 bg-[#e30613] text-white lg:flex lg:flex-col">
        {/* LOGO */}

        <div className="flex h-20 items-center border-b border-white/15 px-6">
          <div className="flex h-14 w-44 items-center overflow-hidden">
            <img
              src="/logo.png"
              alt="MR.DIY"
              className="h-full w-full object-contain"
            />
          </div>
        </div>

        {/* MENU */}

        <nav className="flex-1 px-3 py-6">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Main Menu
          </p>

          <Link
            href="/dashboard"
            className="flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Dashboard
          </Link>

          <Link
            href="/jobs"
            className="mt-1 flex w-full border-l-4 border-white bg-white/15 px-6 py-3 text-left text-sm font-semibold"
          >
            Jobs
          </Link>

          <Link
            href="/applications"
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Applications
          </Link>

          <Link
            href="/messages"
            className="mt-1 flex w-full border-l-4 border-transparent px-6 py-3 text-left text-sm font-medium transition hover:bg-white/10"
          >
            Messages
          </Link>
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

      {/* =========================
          MAIN CONTENT
      ========================== */}

      <div className="lg:ml-60">
        {/* HEADER */}

        <header className="sticky top-0 z-10 flex min-h-20 items-center border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Jobs
            </h1>
          </div>
        </header>

        {/* PAGE CONTENT */}

        <div className="p-5 sm:p-6 lg:p-8">
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
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
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
                    {filteredJobs.map((job) => (
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

                        {/* STATUS */}

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex border px-2.5 py-1 text-[11px] font-semibold ${getStatusStyle(
                              job.status
                            )}`}
                          >
                            {formatStatus(job.status)}
                          </span>
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
          </section>

          {/* FOOTER */}

          <footer className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs text-slate-400">
              MR.DIY Careers Administration
            </p>
          </footer>
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
                  className="w-full border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#e30613]"
                />
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

              {/* DESCRIPTION */}

              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Job Description
                </label>

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
              </div>

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