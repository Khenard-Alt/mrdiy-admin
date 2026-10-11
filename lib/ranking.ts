import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildJobDoc,
  buildPositionText,
  buildProfileDoc,
  scoreCandidate,
  type KeywordMatch,
} from "@/lib/matching";
import { diagnose } from "@/lib/diagnostics";
import { distanceBetween } from "@/lib/location";
import { getResumeText } from "@/lib/resumeText";
import { statusLabel } from "@/lib/pipeline";

/**
 * Ranks everyone who applied for one job from best to weakest match, with strengths, weaknesses
 * and an explanation for each (panel comments: ranking system, strengths and weaknesses, AI explanation).
 */

export type RankedApplicant = {
  rank: number;
  total: number;
  applicationId: string;
  userId: string;
  name: string;
  email: string | null;
  location: string | null;
  status: string;
  statusLabel: string;
  /** The match % (text score and location together). */
  finalScore: number;
  /** The match % saved when the applicant applied, which may differ if the profile changed since. */
  savedScore: number | null;
  textScore: number;
  distanceKm: number | null;
  strengths: string[];
  weaknesses: string[];
  explanation: string;
  keywords: KeywordMatch[];
  matchedSkills: string[];
  missingSkills: string[];
  hasResume: boolean;
  resumeText: string;
  resumeError: string | null;
  resumeKind: string | null;
};

export async function rankApplicants(
  supabase: SupabaseClient,
  jobId: string
): Promise<{ job: { id: string; title: string; location: string | null } | null; applicants: RankedApplicant[] }> {
  const [{ data: job }, { data: applications }, { data: allJobs }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    supabase.from("applications").select("id, user_id, status, match_score, resume_url").eq("job_id", jobId),
    supabase.from("jobs").select("*").limit(1000),
  ]);

  if (!job || !applications || applications.length === 0) {
    return { job: job ? { id: job.id, title: job.title, location: job.location } : null, applicants: [] };
  }

  const userIds = [...new Set(applications.map((item) => item.user_id).filter(Boolean))];
  const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", userIds);

  const corpusDocs = (allJobs ?? []).map(buildJobDoc);
  const jobDoc = buildJobDoc(job);

  const scored = await Promise.all(
    applications.map(async (application) => {
      const profile = (profiles ?? []).find((item) => item.user_id === application.user_id) ?? null;
      const resume = await getResumeText(supabase, application.resume_url || profile?.resume_url || null);

      const score = scoreCandidate({
        profileDoc: buildProfileDoc(profile, resume.text),
        positionText: buildPositionText(profile),
        jobDoc,
        jobTitle: job.title ?? "",
        corpusDocs,
      });
      const distanceKm = distanceBetween(profile?.location, job.location);
      return { application, profile, resume, score, distanceKm };
    })
  );

  const ordered = scored
    .map((item) => ({
      ...item,
      diagnostic: diagnose({
        name: item.profile?.full_name ?? "",
        jobTitle: job.title ?? "this job",
        jobRequirements: job.requirements ?? null,
        profile: {
          skills: item.profile?.skills,
          years_experience: item.profile?.years_experience,
          education: item.profile?.education,
          work_experiences: item.profile?.work_experiences,
          resumeText: item.resume.text,
          hasResume: Boolean(item.application.resume_url || item.profile?.resume_url),
        },
        score: item.score,
        distanceKm: item.distanceKm,
        rank: 0,
        total: 0,
      }),
    }))
    .sort((a, b) => b.diagnostic.finalScore - a.diagnostic.finalScore || b.score.textScore - a.score.textScore);

  // The explanation names the rank, so build it again now that the order is known.
  const applicants: RankedApplicant[] = ordered.map((item, index) => {
    const diagnostic = diagnose({
      name: item.profile?.full_name ?? "",
      jobTitle: job.title ?? "this job",
      jobRequirements: job.requirements ?? null,
      profile: {
        skills: item.profile?.skills,
        years_experience: item.profile?.years_experience,
        education: item.profile?.education,
        work_experiences: item.profile?.work_experiences,
        resumeText: item.resume.text,
        hasResume: Boolean(item.application.resume_url || item.profile?.resume_url),
      },
      score: item.score,
      distanceKm: item.distanceKm,
      rank: index + 1,
      total: ordered.length,
    });

    return {
      rank: index + 1,
      total: ordered.length,
      applicationId: item.application.id,
      userId: item.application.user_id,
      name: item.profile?.full_name ?? "Name not available",
      email: item.profile?.email ?? null,
      location: item.profile?.location ?? null,
      status: item.application.status,
      statusLabel: statusLabel(item.application.status),
      finalScore: diagnostic.finalScore,
      savedScore: item.application.match_score,
      textScore: item.score.textScore,
      distanceKm: item.distanceKm === null ? null : Math.round(item.distanceKm * 10) / 10,
      strengths: diagnostic.strengths,
      weaknesses: diagnostic.weaknesses,
      explanation: diagnostic.explanation,
      keywords: item.score.keywords.slice(0, 40),
      matchedSkills: item.score.matchedSkills,
      missingSkills: item.score.missingSkills,
      hasResume: Boolean(item.application.resume_url || item.profile?.resume_url),
      resumeText: item.resume.text,
      resumeError: item.resume.error,
      resumeKind: item.resume.kind,
    };
  });

  return { job: { id: job.id, title: job.title, location: job.location }, applicants };
}
