"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeToken, type KeywordMatch } from "@/lib/matching";

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
  currentScore: number | null;
  textScore: number;
  distanceKm: number | null;
  keywords: KeywordMatch[];
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
  explanation: string;
  rank: number | null;
  totalApplicants: number | null;
  velocity: { label: string; factors: string[] };
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
 * Applicant picture, the ranking with strengths and weaknesses and a plain-language explanation,
 * the match breakdown, how soon they could start, and the resume text with the words the matching
 * used highlighted, so HR can double-check the score against the resume.
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

  const shareByStem = useMemo(
    () => new Map((review?.keywords ?? []).map((keyword) => [keyword.term, keyword.share])),
    [review]
  );

  const highlighted = useMemo(() => {
    if (!review?.resumeText) return null;
    // Split into words and everything between them so the original layout is kept.
    return review.resumeText.split(/([\p{L}\p{N}+#]+)/u).map((part, index) => {
      const share = part.length > 2 ? shareByStem.get(normalizeToken(part)) : undefined;
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
  }, [review, shareByStem]);

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
  const requiredSkills = review.matchedSkills.length + review.missingSkills.length;

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

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Applicant review</p>
          <h3 className="mt-1 truncate text-xl font-bold text-slate-900">
            {review.applicant.name ?? "Name not available"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {[review.applicant.desiredPosition, review.applicant.location].filter(Boolean).join(" · ") ||
              "No profile details"}
          </p>
          {!review.photoUrl && <p className="mt-1 text-xs text-slate-400">No profile picture uploaded.</p>}
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {review.rank !== null && (
            <span className="border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-xs font-bold text-yellow-800">
              Rank #{review.rank} of {review.totalApplicants} for this job
            </span>
          )}
          <a
            href={`/api/applications/biodata?id=${encodeURIComponent(applicationId)}`}
            className="bg-[#e30613] px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Download biodata (PDF)
          </a>
        </div>
      </div>

      {/* EXPLANATION */}

      {review.explanation && (
        <div className="mt-6 border-l-4 border-[#e30613] bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this rank</p>
          <p className="mt-1 text-sm leading-6 text-slate-800">{review.explanation}</p>
        </div>
      )}

      {/* SCORES */}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Match score today</p>
          <p className="mt-1 text-3xl font-bold text-purple-700">
            {review.currentScore !== null ? `${review.currentScore}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-purple-700/80">
            {review.matchScore !== null
              ? `Saved when they applied: ${review.matchScore}%`
              : "No score was saved when they applied."}
          </p>
        </div>

        <div className="border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Text match</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">{review.textScore}%</p>
          <p className="mt-1 text-xs text-slate-500">Words, skills and position vs the job (70% of the score).</p>
        </div>

        <div className="border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Required skills found</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">
            {review.matchedSkills.length}
            <span className="text-lg font-semibold text-slate-400"> / {requiredSkills}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {review.matchedSkills.map((skill) => (
              <span key={skill} className="bg-yellow-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distance to branch</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">
            {review.distanceKm === null ? "—" : review.distanceKm < 1.5 ? "Same area" : `~${Math.floor(review.distanceKm)} km`}
          </p>
          <p className="mt-1 text-xs text-slate-500">From the applicant&apos;s address (30% of the score).</p>
        </div>
      </div>

      {/* STRENGTHS AND WEAKNESSES */}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="border border-green-200 bg-green-50 p-4">
          <h4 className="text-sm font-bold text-green-800">Strengths</h4>
          <ul className="mt-2 space-y-1.5">
            {review.strengths.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-800">
                <span className="font-bold text-green-700">+</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-red-200 bg-red-50 p-4">
          <h4 className="text-sm font-bold text-red-800">Weaknesses and gaps</h4>
          <ul className="mt-2 space-y-1.5">
            {review.weaknesses.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-800">
                <span className="font-bold text-red-700">−</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* WHEN COULD THEY START */}

      <div className="mt-5 border border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How soon could they start</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{review.velocity.label}</p>
        <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
          {review.velocity.factors.map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
      </div>

      {/* EMAILS SENT */}

      <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-bold text-slate-800">Emails sent to this applicant</h4>
        {review.emails.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            None yet. An email is sent when the status changes (except Pending) and when an interview is set.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {review.emails.map((email, index) => (
              <li key={index} className="text-xs text-slate-600">
                <span
                  className={`mr-2 inline-block px-2 py-0.5 font-semibold ${
                    email.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
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

      {/* KEYWORDS */}

      <div className="mt-6">
        <h4 className="text-sm font-bold text-slate-800">What the model matched ({review.job?.title ?? "this job"})</h4>
        <p className="mt-1 text-xs text-slate-500">
          Words found in both the resume and the job. The percentage is each word&apos;s share of the text match.
        </p>

        {topKeywords.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No shared words were found.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {topKeywords.map((keyword) => (
              <li key={keyword.term} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate font-medium text-slate-700">{keyword.label}</span>
                <span className="h-2.5 flex-1 bg-slate-100">
                  <span
                    className="block h-full bg-yellow-400"
                    style={{ width: `${Math.max(4, (keyword.share / maxShare) * 100)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-xs font-semibold text-slate-500">{keyword.share}%</span>
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
          <p className="mt-3 text-sm text-red-600">Could not read the resume text: {review.resumeError}</p>
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
