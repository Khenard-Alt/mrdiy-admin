"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Interview = {
  id: string;
  scheduled_at: string;
  venue: string;
  mode: "in_person" | "online";
  meeting_link: string | null;
  notes: string | null;
  status: "Scheduled" | "Rescheduled" | "Cancelled" | "Completed";
  applicant_response: "Pending" | "Confirmed" | "Declined";
  responded_at: string | null;
};

type Props = {
  applicationId: string;
  /** Pre-fills the venue (the job's branch). */
  defaultVenue: string;
  /** Called when the application's status changed because of the interview. */
  onStatusChange: (status: string) => void;
};

const RESPONSE_STYLE: Record<Interview["applicant_response"], string> = {
  Pending: "border-yellow-200 bg-yellow-50 text-yellow-700",
  Confirmed: "border-green-200 bg-green-50 text-green-700",
  Declined: "border-red-200 bg-red-50 text-red-700",
};

const RESPONSE_TEXT: Record<Interview["applicant_response"], string> = {
  Pending: "Waiting for the applicant's answer",
  Confirmed: "Applicant confirmed",
  Declined: "Applicant can't attend",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's own time zone. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** Schedule, reschedule or cancel the interview of one application, and see the applicant's answer. */
export default function InterviewPanel({ applicationId, defaultVenue, onStatusChange }: Props) {
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [when, setWhen] = useState("");
  const [mode, setMode] = useState<"in_person" | "online">("in_person");
  const [venue, setVenue] = useState(defaultVenue);
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");

  const active = interviews?.find((item) => item.status === "Scheduled" || item.status === "Rescheduled");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/interviews?applicationId=${encodeURIComponent(applicationId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load the interview.");
      setInterviews(data.interviews ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load the interview.";
      setError(message.includes("schema cache") ? "The interview and document tables are not set up yet. Run 202610120001_recruitment_pipeline.sql in the Supabase SQL Editor." : message);
      setInterviews([]);
    }
  }, [applicationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function startReschedule(interview: Interview) {
    setWhen(toLocalInput(interview.scheduled_at));
    setMode(interview.mode);
    setVenue(interview.mode === "in_person" ? interview.venue : defaultVenue);
    setLink(interview.meeting_link ?? "");
    setNotes(interview.notes ?? "");
    setNotice("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          scheduledAt: when ? new Date(when).toISOString() : "",
          mode,
          venue,
          meetingLink: link,
          notes,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save the interview.");

      onStatusChange("Interview Scheduled");
      const emailNote =
        data.email?.status === "sent"
          ? ` Email sent to ${data.email.to}.`
          : data.email?.status === "not_configured"
            ? " (Email is not set up yet.)"
            : data.email?.error
              ? ` Email problem: ${data.email.error}`
              : "";
      setNotice(
        `${data.rescheduled ? "Interview rescheduled" : "Interview scheduled"}. The applicant was notified in the app.${emailNote}`
      );
      setWhen("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the interview.");
    } finally {
      setSaving(false);
    }
  }

  async function act(interview: Interview, action: "cancel" | "complete") {
    if (action === "cancel" && !window.confirm("Cancel this interview? The applicant will be told.")) return;
    setError("");
    setNotice("");
    setSaving(true);

    try {
      const response = await fetch("/api/interviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: interview.id, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update the interview.");

      if (data.status) onStatusChange(data.status);
      setNotice(action === "cancel" ? "Interview cancelled and the applicant was told." : "Interview marked as completed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the interview.");
    } finally {
      setSaving(false);
    }
  }

  const history = (interviews ?? []).filter((item) => item !== active);
  const inputClass =
    "w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e30613]";

  return (
    <section className="mt-6 border border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900">Interview</h3>
      <p className="mt-1 text-sm text-slate-500">
        Schedule the interview. The applicant gets a notification, a message and an email, and can confirm or decline
        in the app.
      </p>

      {interviews === null && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {active && (
        <div className="mt-5 border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                {active.status === "Rescheduled" ? "Rescheduled interview" : "Scheduled interview"}
              </p>
              <p className="mt-1 text-base font-bold text-slate-900">{formatWhen(active.scheduled_at)}</p>
              <p className="mt-1 text-sm text-slate-700">
                {active.mode === "online" ? (
                  <>
                    Online ·{" "}
                    <a href={active.meeting_link ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[#e30613] underline">
                      meeting link
                    </a>
                  </>
                ) : (
                  active.venue
                )}
              </p>
              {active.notes && <p className="mt-1 text-xs text-slate-600">Notes: {active.notes}</p>}
            </div>
            <span
              className={`inline-flex border px-3 py-1.5 text-xs font-semibold ${RESPONSE_STYLE[active.applicant_response]}`}
            >
              {RESPONSE_TEXT[active.applicant_response]}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              disabled={saving}
              onClick={() => startReschedule(active)}
              className="border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-[#e30613] hover:text-[#e30613]"
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => act(active, "complete")}
              className="border border-green-300 bg-white px-3 py-2 font-semibold text-green-700 hover:bg-green-50"
            >
              Mark as done
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => act(active, "cancel")}
              className="border border-red-200 bg-white px-3 py-2 font-semibold text-red-600 hover:bg-red-50"
            >
              Cancel interview
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date and time
          </label>
          <input
            type="datetime-local"
            required
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as "in_person" | "online")}
            className={inputClass}
          >
            <option value="in_person">In person (at the branch)</option>
            <option value="online">Online (video call)</option>
          </select>
        </div>

        {mode === "in_person" ? (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Venue</label>
            <input
              type="text"
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              placeholder="Branch or address"
              className={inputClass}
            />
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Meeting link
            </label>
            <input
              type="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://meet.google.com/..."
              className={inputClass}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes for the applicant (optional)
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="What to bring, who to look for…"
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#e30613] px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : active ? "Reschedule interview" : "Schedule interview"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}
      {notice && (
        <p className="mt-4 border border-green-200 bg-green-50 px-4 py-3 text-xs font-semibold text-green-700">{notice}</p>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-800">Earlier interviews</h4>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {history.map((item) => (
              <li key={item.id}>
                {formatWhen(item.scheduled_at)} · {item.mode === "online" ? "Online" : item.venue} ·{" "}
                <span className="font-semibold">{item.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
