"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Job = {
  id: number;
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
  status: "Open",
};

export default function JobsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const [form, setForm] = useState<JobForm>(emptyForm);

  // =========================================================
  // INITIAL LOAD + JOBS REALTIME
  // =========================================================
  useEffect(() => {
    let jobsChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function initializeJobs() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      if (user.app_metadata?.role !== "admin") {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      // Initial jobs load
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, title, description, location, salary, status, created_at, salary_type"
        )
        .order("created_at", {
          ascending: false,
        });

      if (cancelled) {
        return;
      }

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setJobs(data ?? []);
      setLoading(false);

      // =====================================================
      // REALTIME SUBSCRIPTION
      // =====================================================
      jobsChannel = supabase
        .channel("jobs-page-realtime")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "jobs",
          },
          (payload) => {
            const newJob = payload.new as Job;

            setJobs((currentJobs) => {
              // Prevent duplicate job
              if (currentJobs.some((job) => job.id === newJob.id)) {
                return currentJobs;
              }

              return [newJob, ...currentJobs];
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "jobs",
          },
          (payload) => {
            const updatedJob = payload.new as Job;

            setJobs((currentJobs) =>
              currentJobs
                .map((job) =>
                  job.id === updatedJob.id ? updatedJob : job
                )
                .sort((a, b) => {
                  const dateA = a.created_at
                    ? new Date(a.created_at).getTime()
                    : 0;

                  const dateB = b.created_at
                    ? new Date(b.created_at).getTime()
                    : 0;

                  return dateB - dateA;
                })
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "jobs",
          },
          (payload) => {
            const deletedJob = payload.old as Job;

            setJobs((currentJobs) =>
              currentJobs.filter((job) => job.id !== deletedJob.id)
            );
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            setError("Unable to connect to Jobs Realtime.");
          }
        });
    }

    initializeJobs();

    return () => {
      cancelled = true;

      if (jobsChannel) {
        supabase.removeChannel(jobsChannel);
      }
    };
  }, []);

  // =========================================================
  // ADD JOB MODAL
  // =========================================================
  function openAddModal() {
    setEditingJob(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  // =========================================================
  // EDIT JOB MODAL
  // =========================================================
  function openEditModal(job: Job) {
    setEditingJob(job);

    setForm({
      title: job.title ?? "",
      description: job.description ?? "",
      location: job.location ?? "",
      salary: job.salary ?? "",
      salary_type: job.salary_type ?? "Monthly",
      status: job.status ?? "Open",
    });

    setError("");
    setShowModal(true);
  }

  // =========================================================
  // CLOSE MODAL
  // =========================================================
  function closeModal() {
    if (saving) {
      return;
    }

    setShowModal(false);
    setEditingJob(null);
    setForm(emptyForm);
    setError("");
  }

  // =========================================================
  // UPDATE FORM
  // =========================================================
  function updateForm(field: keyof JobForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  // =========================================================
  // SAVE / UPDATE JOB
  // =========================================================
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!form.title.trim()) {
      setError("Job title is required.");
      return;
    }

    if (!form.location.trim()) {
      setError("Location is required.");
      return;
    }

    setSaving(true);

    // EDIT
    if (editingJob) {
      const { error } = await supabase
        .from("jobs")
        .update({
          title: form.title.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          salary: form.salary.trim(),
          salary_type: form.salary_type,
          status: form.status,
        })
        .eq("id", editingJob.id);

      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }

    // ADD
    else {
      const { error } = await supabase.from("jobs").insert({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        salary: form.salary.trim(),
        salary_type: form.salary_type,
        status: form.status,
      });

      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    closeModal();

    // IMPORTANT:
    // No manual loadJobs() here.
    // Supabase Realtime will automatically update the page.
  }

  // =========================================================
  // DELETE JOB
  // =========================================================
  async function handleDelete(job: Job) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${job.title ?? "this job"}"?`
    );

    if (!confirmed) {
      return;
    }

    setError("");

    const { error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", job.id);

    if (error) {
      setError(error.message);
      return;
    }

    // IMPORTANT:
    // No manual loadJobs() here.
    // DELETE Realtime event will remove it automatically.
  }

  // =========================================================
  // LOGOUT
  // =========================================================
  async function handleLogout() {
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  // =========================================================
  // DATE FORMAT
  // =========================================================
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

  // =========================================================
  // SEARCH
  // =========================================================
  const filteredJobs = jobs.filter((job) => {
    const searchText = search.toLowerCase().trim();

    if (!searchText) {
      return true;
    }

    return (
      (job.title ?? "").toLowerCase().includes(searchText) ||
      (job.location ?? "").toLowerCase().includes(searchText) ||
      (job.description ?? "").toLowerCase().includes(searchText) ||
      (job.status ?? "").toLowerCase().includes(searchText)
    );
  });

  // =========================================================
  // UI
  // =========================================================
  return (
    <main className="min-h-screen bg-gray-100">
      {/* =====================================================
          SIDEBAR
      ====================================================== */}
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
            <span className="mr-3 text-xl">📊</span>
            Dashboard
          </button>

          {/* JOBS */}
          <button
            type="button"
            className="mt-2 flex w-full items-center rounded-xl bg-white/20 px-4 py-3 text-left font-semibold"
          >
            <span className="mr-3 text-xl">💼</span>
            Jobs
          </button>

          {/* APPLICATIONS */}
          <button
            type="button"
            onClick={() => router.push("/applications")}
            className="mt-2 flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition hover:bg-white/10"
          >
            <span className="mr-3 text-xl">📋</span>
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
            <span className="mr-3 text-xl">🚪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* =====================================================
          MAIN
      ====================================================== */}
      <div className="lg:ml-64">
        {/* TOP BAR */}
        <header className="flex min-h-20 items-center border-b bg-white px-6 py-4 shadow-sm lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Jobs
            </h1>

            <p className="text-sm text-gray-500">
              Manage MR.DIY job openings
            </p>
          </div>
        </header>

        {/* CONTENT */}
        <div className="p-6 lg:p-8">
          {/* PAGE HEADER */}
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Job Listings
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {jobs.length} job
                {jobs.length !== 1 ? "s" : ""} in the system
              </p>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="rounded-xl bg-[#e30613] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#c80511]"
            >
              + Add New Job
            </button>
          </div>

          {/* ERROR */}
          {error && !showModal && (
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
                placeholder="Search jobs by title, location, or status..."
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-4 text-gray-900 outline-none transition focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
              />
            </div>
          </div>

          {/* JOBS TABLE */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {loading ? (
              <div className="flex min-h-64 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-[#e30613]" />

                  <p className="mt-4 text-sm text-gray-500">
                    Loading jobs...
                  </p>
                </div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="text-5xl">💼</div>

                <h3 className="mt-4 text-lg font-bold text-gray-900">
                  {search
                    ? "No jobs found"
                    : "No jobs available"}
                </h3>

                <p className="mt-2 text-sm text-gray-500">
                  {search
                    ? "Try a different search term."
                    : "Create your first job posting."}
                </p>

                {!search && (
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="mt-5 rounded-xl bg-[#e30613] px-5 py-3 text-sm font-semibold text-white hover:bg-[#c80511]"
                  >
                    + Add New Job
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Job
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Location
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Salary
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Status
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Created
                      </th>

                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {filteredJobs.map((job) => {
                      const status = job.status ?? "Open";

                      const statusLower =
                        status.toLowerCase();

                      const statusClass =
                        statusLower === "open" ||
                        statusLower === "active"
                          ? "bg-green-100 text-green-700"
                          : statusLower === "closed"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700";

                      return (
                        <tr
                          key={job.id}
                          className="transition hover:bg-gray-50"
                        >
                          {/* JOB */}
                          <td className="px-6 py-5">
                            <div className="max-w-sm">
                              <p className="font-bold text-gray-900">
                                {job.title ||
                                  "Untitled Job"}
                              </p>

                              <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                                {job.description ||
                                  "No description provided."}
                              </p>
                            </div>
                          </td>

                          {/* LOCATION */}
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <span>📍</span>
                              {job.location || "—"}
                            </div>
                          </td>

                          {/* SALARY */}
                          <td className="px-6 py-5">
                            <p className="text-sm font-semibold text-gray-800">
                              {job.salary || "—"}
                            </p>

                            {job.salary_type && (
                              <p className="mt-1 text-xs text-gray-500">
                                {job.salary_type}
                              </p>
                            )}
                          </td>

                          {/* STATUS */}
                          <td className="px-6 py-5">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}
                            >
                              {status}
                            </span>
                          </td>

                          {/* CREATED */}
                          <td className="px-6 py-5 text-sm text-gray-600">
                            {formatDate(job.created_at)}
                          </td>

                          {/* ACTIONS */}
                          <td className="px-6 py-5">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal(job)
                                }
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                              >
                                ✏️ Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDelete(job)
                                }
                                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================
          ADD / EDIT MODAL
      ====================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            {/* HEADER */}
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingJob
                    ? "Edit Job"
                    : "Add New Job"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingJob
                    ? "Update the job posting details."
                    : "Create a new MR.DIY job posting."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl px-3 py-2 text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* FORM */}
            <form
              onSubmit={handleSubmit}
              className="p-6"
            >
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* TITLE */}
              <div>
                <label
                  htmlFor="job-title"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Job Title *
                </label>

                <input
                  id="job-title"
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
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </div>

              {/* LOCATION */}
              <div className="mt-5">
                <label
                  htmlFor="job-location"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Location *
                </label>

                <input
                  id="job-location"
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
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </div>

              {/* SALARY */}
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="job-salary"
                    className="mb-2 block text-sm font-semibold text-gray-800"
                  >
                    Salary
                  </label>

                  <input
                    id="job-salary"
                    type="text"
                    value={form.salary}
                    onChange={(event) =>
                      updateForm(
                        "salary",
                        event.target.value
                      )
                    }
                    placeholder="e.g. ₱15,000"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="salary-type"
                    className="mb-2 block text-sm font-semibold text-gray-800"
                  >
                    Salary Type
                  </label>

                  <select
                    id="salary-type"
                    value={form.salary_type}
                    onChange={(event) =>
                      updateForm(
                        "salary_type",
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
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
                <label
                  htmlFor="job-status"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Status
                </label>

                <select
                  id="job-status"
                  value={form.status}
                  onChange={(event) =>
                    updateForm(
                      "status",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                >
                  <option value="Open">
                    Open
                  </option>

                  <option value="Closed">
                    Closed
                  </option>

                  <option value="Draft">
                    Draft
                  </option>
                </select>
              </div>

              {/* DESCRIPTION */}
              <div className="mt-5">
                <label
                  htmlFor="job-description"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Job Description
                </label>

                <textarea
                  id="job-description"
                  value={form.description}
                  onChange={(event) =>
                    updateForm(
                      "description",
                      event.target.value
                    )
                  }
                  placeholder="Enter the job description..."
                  rows={6}
                  className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
                />
              </div>

              {/* BUTTONS */}
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#e30613] px-6 py-3 font-semibold text-white hover:bg-[#c80511] disabled:cursor-not-allowed disabled:opacity-60"
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