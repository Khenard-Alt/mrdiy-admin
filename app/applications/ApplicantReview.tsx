"use client";

import { useEffect, useMemo, useState } from "react";

type Keyword = { term: string; share: number };

type Review = {
  applicant: {
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    desiredPosition: string | null;
    skills: string[];
  };
  job: { title: string | null; location: string | null } | null;
  photoUrl: string | null;
  resumeUrl: string | null;
  resumeKind: "pdf" | "docx" | "text" | null;
  resumeText: string;
  resumeError: string | null;
  emails: {
    to_email: string;
    subject: string;
    status: "sent" | "failed";
    error: string | null;
    created_at: string;
  }[];
  matchScore: number | null;
  textScore: number;
  keywords: Keyword[];
  matchedSkills: string[];
};

function highlightClass(share: number) {
  if (share >= 8) return "bg-yellow-300 text-slate-900";
  if (share >= 3) return "bg-yellow-200 text-slate-900";
  return "bg-yellow-100 text-slate-900";
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Applicant picture, the match breakdown, and the resume text with the words the matching
 * model used highlighted, so the admin can double-check the score against the resume.
 */
export default function ApplicantReview({ applicationId }: { applicationId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The parent gives this component a key per application, so state starts fresh each time.
    let cancelled = false;

    fetch(`/api/applications/review?id=${encodeURIComponent(applicationId)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not load the review.");
        return data as Review;
      })
      .then((data) => {
        if (!cancelled) setReview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const shareByTerm = useMemo(
    () => new Map((review?.keywords ?? []).map((keyword) => [keyword.term, keyword.share])),
    [review]
  );

  const highlighted = useMemo(() => {
    if (!review?.resumeText) return null;
    // Split into words and everything between them so the original layout is kept.
    return review.resumeText.split(/([\p{L}\p{N}+#]+)/u).map((part, index) => {
      const share = shareByTerm.get(part.toLowerCase());
      if (share === undefined) return part;
      return (
        <mark
          key={index}
          title={`"${part.toLowerCase()}" accounts for ${share}% of the text match`}
          className={`rounded-sm px-0.5 ${highlightClass(share)}`}
        >
          {part}
        </mark>
      );
    });
  }, [review, shareByTerm]);

  if (loading) {
    return (
      <section className="mt-6 border border-slate-200 p-6">
        <p className="text-sm text-slate-500">Scanning resume and computing the match…</p>
      </section>
    );
  }

  if (error || !review) {
    return (
      <section className="mt-6 border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-semibold text-red-700">{error || "Review unavailable."}</p>
      </section>
    );
  }

  const topKeywords = review.keywords.slice(0, 10);
  const maxShare = topKeywords[0]?.share || 1;

  return (
    <section className="mt-6 border border-slate-200 p-6">
      {/* APPLICANT */}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {review.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.photoUrl}
            alt={review.applicant.name ?? "Applicant"}
            className="h-24 w-24 shrink-0 border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-slate-200 text-2xl font-bold text-slate-500">
            {initials(review.applicant.name)}
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Applicant review
          </p>
          <h3 className="mt-1 truncate text-xl font-bold text-slate-900">
            {review.applicant.name ?? "Name not available"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {[review.applicant.desiredPosition, review.applicant.location]
              .filter(Boolean)
              .join(" · ") || "No profile details"}
          </p>
          {!review.photoUrl && (
            <p className="mt-1 text-xs text-slate-400">No profile picture uploaded.</p>
          )}
        </div>
      </div>

      {/* EMAILS SENT */}

      <div className="mt-6 border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-bold text-slate-800">Emails sent to this applicant</h4>
        {review.emails.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            None yet. An email is sent when the status changes to Reviewed, Approved or Rejected.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {review.emails.map((email, index) => (
              <li key={index} className="text-xs text-slate-600">
                <span
                  className={`mr-2 inline-block px-2 py-0.5 font-semibold ${
                    email.status === "sent"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {email.status === "sent" ? "Sent" : "Failed"}
                </span>
                <span className="font-medium text-slate-800">{email.subject}</span> to {email.to_email} ·{" "}
                {new Date(email.created_at).toLocaleString()}
                {email.error && <span className="text-red-600"> — {email.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* SCORES */}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            Match score
          </p>
          <p className="mt-1 text-3xl font-bold text-purple-700">
            {review.matchScore !== null ? `${review.matchScore}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-purple-700/80">
            {review.matchScore !== null
              ? "Saved when the applicant applied (text 70% + location 30%)."
              : "Not saved for this application."}
          </p>
        </div>

        <div className="border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resume vs job text
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-800">{review.textScore}%</p>
          <p className="mt-1 text-xs text-slate-500">
            Recomputed here from the resume and job description.
          </p>
        </div>

        <div className="border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Skills found in the job
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-800">
            {review.matchedSkills.length}
            <span className="text-lg font-semibold text-slate-400">
              {" "}
              / {review.applicant.skills.length}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {review.matchedSkills.map((skill) => (
              <span
                key={skill}
                className="bg-yellow-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* KEYWORDS */}

      <div className="mt-6">
        <h4 className="text-sm font-bold text-slate-800">
          What the model matched ({review.job?.title ?? "this job"})
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Words found in both the resume and the job. The percentage is each word&apos;s share of
          the text match.
        </p>

        {topKeywords.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No shared words were found.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {topKeywords.map((keyword) => (
              <li key={keyword.term} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate font-medium text-slate-700">
                  {keyword.term}
                </span>
                <span className="h-2.5 flex-1 bg-slate-100">
                  <span
                    className="block h-full bg-yellow-400"
                    style={{ width: `${Math.max(4, (keyword.share / maxShare) * 100)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-xs font-semibold text-slate-500">
                  {keyword.share}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* RESUME TEXT WITH HIGHLIGHTS */}

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-800">Resume text scanned by the model</h4>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span>Weight:</span>
            <span className="bg-yellow-100 px-1.5 py-0.5">low</span>
            <span className="bg-yellow-200 px-1.5 py-0.5">medium</span>
            <span className="bg-yellow-300 px-1.5 py-0.5">high</span>
          </div>
        </div>

        {review.resumeError && (
          <p className="mt-3 text-sm text-red-600">
            Could not read the resume text: {review.resumeError}
          </p>
        )}

        {highlighted ? (
          <div className="mt-3 max-h-[480px] overflow-y-auto whitespace-pre-wrap border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700">
            {highlighted}
          </div>
        ) : (
          !review.resumeError && (
            <p className="mt-3 text-sm text-slate-400">
              {review.resumeUrl
                ? "No readable text was found in this resume (it may be a scanned image)."
                : "This applicant has no resume."}
            </p>
          )
        )}
      </div>
    </section>
  );
}
