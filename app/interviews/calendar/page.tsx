"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminAlertsBell from "@/components/AdminAlertsBell";
import Sidebar from "@/components/Sidebar";

type Interview = {
  id: string;
  applicationId: string;
  scheduledAt: string;
  venue: string | null;
  mode: "in_person" | "online";
  meetingLink: string | null;
  status: string;
  applicantResponse: "Pending" | "Confirmed" | "Declined";
  jobTitle: string | null;
  applicantName: string | null;
};

type ReadyApplicant = {
  applicationId: string;
  jobTitle: string | null;
  applicantName: string | null;
  shortlistedAt: string | null;
};

const RESPONSE_STYLE: Record<Interview["applicantResponse"], string> = {
  Pending: "border-yellow-200 bg-yellow-50 text-yellow-700",
  Confirmed: "border-green-200 bg-green-50 text-green-700",
  Declined: "border-red-200 bg-red-50 text-red-700",
};

const RESPONSE_DOT: Record<Interview["applicantResponse"], string> = {
  Pending: "bg-yellow-400",
  Confirmed: "bg-green-500",
  Declined: "bg-red-500",
};

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayLong(date: Date) {
  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function InterviewCalendarPage() {
  const router = useRouter();

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(ymd(today));

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [readyToInterview, setReadyToInterview] = useState<ReadyApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const firstOfMonth = new Date(viewYear, viewMonth, 1);
        const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
        const params = new URLSearchParams({ from: ymd(firstOfMonth), to: ymd(lastOfMonth) });

        const response = await fetch(`/api/interviews/calendar?${params.toString()}`);

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load interviews.");
        }

        const data = await response.json();
        if (!cancelled) {
          setInterviews(data.interviews ?? []);
          setReadyToInterview(data.readyToInterview ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth, router]);

  const interviewsByDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const interview of interviews) {
      const key = ymd(new Date(interview.scheduledAt));
      const existing = map.get(key) ?? [];
      existing.push(interview);
      map.set(key, existing);
    }
    return map;
  }, [interviews]);

  const selectedInterviews = (interviewsByDay.get(selectedDate) ?? []).slice().sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  // Calendar grid cells: leading days from previous month + this month's days,
  // padded to full weeks (Sun-start), so the grid always renders whole rows.
  const gridCells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ date: new Date(viewYear, viewMonth, i - startOffset + 1), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(viewYear, viewMonth, day), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }
    return cells;
  }, [viewYear, viewMonth]);

  function goToMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(ymd(today));
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <Sidebar active="/interviews/calendar" />

      <div className="pt-14 lg:ml-60 lg:pt-0">
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              MR.DIY Careers
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Interview Calendar
            </h1>
          </div>
          <AdminAlertsBell />
        </header>

        <div className="p-5 sm:p-6 lg:p-8">
          {error && (
            <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            {/* CALENDAR GRID */}
            <section className="border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-900">{monthLabel}</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToToday}
                    className="border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#e30613] hover:text-[#e30613]"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => goToMonth(-1)}
                    aria-label="Previous month"
                    className="flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-600 hover:border-[#e30613] hover:text-[#e30613]"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => goToMonth(1)}
                    aria-label="Next month"
                    className="flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-600 hover:border-[#e30613] hover:text-[#e30613]"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 border-b border-slate-100 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-2">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {gridCells.map(({ date, inMonth }) => {
                  const key = ymd(date);
                  const dayInterviews = interviewsByDay.get(key) ?? [];
                  const isSelected = key === selectedDate;
                  const isToday = key === ymd(today);

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDate(key)}
                      className={`flex min-h-[84px] flex-col items-start gap-1 border-b border-r border-slate-100 p-2 text-left transition last:border-r-0 ${
                        inMonth ? "bg-white" : "bg-slate-50 text-slate-400"
                      } ${isSelected ? "ring-2 ring-inset ring-[#e30613]" : "hover:bg-slate-50"}`}
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center text-xs font-semibold ${
                          isToday ? "rounded-full bg-[#e30613] text-white" : inMonth ? "text-slate-700" : "text-slate-400"
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      {dayInterviews.length > 0 && (
                        <div className="flex w-full flex-wrap items-center gap-1">
                          <span className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {dayInterviews.length}
                          </span>
                          <span className="flex items-center gap-0.5">
                            {dayInterviews.slice(0, 4).map((interview) => (
                              <span
                                key={interview.id}
                                className={`h-1.5 w-1.5 rounded-full ${
                                  interview.status === "Completed" ? "bg-slate-400" : RESPONSE_DOT[interview.applicantResponse]
                                }`}
                              />
                            ))}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* SIDE LIST PANEL */}
            <section className="border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-sm font-bold text-slate-900">{formatDayLong(new Date(selectedDate))}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {loading
                    ? "Loading…"
                    : `${selectedInterviews.length} interview${selectedInterviews.length === 1 ? "" : "s"}`}
                </p>
              </div>

              {selectedInterviews.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  No interviews on this day.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {selectedInterviews.map((interview) => (
                    <li key={interview.id}>
                      <Link
                        href={`/applications?open=${encodeURIComponent(interview.applicationId)}`}
                        className="block px-5 py-4 transition hover:bg-slate-50"
                      >
                        <p className="text-sm font-semibold text-slate-800">
                          {formatTime(interview.scheduledAt)}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {interview.applicantName || "Applicant"} · {interview.jobTitle || "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {interview.mode === "online" ? "Online" : interview.venue || "—"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {interview.status === "Completed" ? (
                            <span className="inline-flex w-fit border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              Done
                            </span>
                          ) : (
                            <span
                              className={`inline-flex w-fit border px-2 py-0.5 text-[11px] font-semibold ${RESPONSE_STYLE[interview.applicantResponse]}`}
                            >
                              {interview.applicantResponse === "Pending"
                                ? "Awaiting response"
                                : interview.applicantResponse}
                            </span>
                          )}
                          {interview.status === "Rescheduled" && (
                            <span className="inline-flex w-fit border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              Rescheduled
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* READY TO INTERVIEW — shortlisted, not yet scheduled */}
          <section className="mt-6 border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Ready to Interview</h2>
              <p className="mt-1 text-sm text-slate-500">
                Shortlisted applicants with no interview scheduled yet. Click one to set a date, time and venue.
              </p>
            </div>

            {readyToInterview.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No one is waiting to be scheduled right now.
              </div>
            ) : (
              <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
                {readyToInterview.map((applicant) => (
                  <li key={applicant.applicationId} className="bg-white">
                    <Link
                      href={`/applications?open=${encodeURIComponent(applicant.applicationId)}`}
                      className="block px-5 py-4 transition hover:bg-slate-50"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {applicant.applicantName || "Applicant"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{applicant.jobTitle || "—"}</p>
                      {applicant.shortlistedAt && (
                        <p className="mt-2 text-[11px] text-slate-400">
                          Shortlisted{" "}
                          {new Date(applicant.shortlistedAt).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      )}
                      <span className="mt-2 inline-flex w-fit border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        Schedule interview →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
