import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPositionText,
  scoreCandidate,
  buildJobDoc,
  buildProfileDoc,
  combineScore,
  type JobDocFields,
} from "@/lib/matching";
import { distanceBetween, formatDistance, NEAR_ME_RADIUS_KM } from "@/lib/location";
import { sendPush } from "@/lib/push";
import { isKnownStatus, statusContent } from "@/lib/pipeline";

/** Applicants whose combined match score for a new job reaches this get a "matches you" alert. */
export const JOB_MATCH_THRESHOLD = 50;

export type AlertType =
  | "NEW_JOB"
  | "NEARBY_JOB"
  | "JOB_MATCH"
  | "RECOMMENDED_JOB"
  | "APPLICATION_UPDATE"
  | "INTERVIEW_INVITE"
  | "MESSAGE"
  | "SYSTEM";

export type AlertInsert = {
  user_id: string;
  type: AlertType;
  title: string;
  message: string;
  job_id?: string | null;
  application_id?: string | null;
};

export async function insertAlerts(supabase: SupabaseClient, alerts: AlertInsert[]) {
  const alertIds: string[] = [];
  for (let start = 0; start < alerts.length; start += 500) {
    const { data, error } = await supabase
      .from("alerts")
      .insert(alerts.slice(start, start + 500))
      .select("id");
    if (error) return error.message;
    (data ?? []).forEach((row) => alertIds.push(row.id));
  }

  // Also show it in the phone's tray (works when the app is closed). Best effort, needs Firebase set up.
  await sendPush(
    supabase,
    alerts.map((alert, index) => ({
      userId: alert.user_id,
      title: alert.title,
      body: alert.message,
      data: {
        type: alert.type,
        ...(alertIds[index] ? { alert_id: alertIds[index] } : {}),
        ...(alert.job_id ? { job_id: alert.job_id } : {}),
        ...(alert.application_id ? { application_id: alert.application_id } : {}),
      },
    }))
  );
  return null;
}

type NewJob = JobDocFields & { id: string; branch_id?: string | null; location?: string | null };

/**
 * Tells every applicant about a newly published job. One alert per applicant:
 * "near you" if a branch is within the radius, else "matches your profile", else a plain "new job".
 * Applicants already notified by [notifyNearMissPastApplicants] for this same job are skipped
 * here (via `excludeUserIds`) so no one gets two alerts about the same posting.
 */
export async function notifyNewJob(
  supabase: SupabaseClient,
  job: NewJob,
  excludeUserIds: Set<string> = new Set()
) {
  const [{ data: profiles, error: profileError }, { data: jobs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, location, skills, desired_position, headline, about, work_experiences, education, resume_url"),
    supabase.from("jobs").select("*").eq("status", "published").limit(1000),
  ]);

  if (profileError) throw new Error(profileError.message);

  const corpus = (jobs ?? []).map(buildJobDoc);
  const jobDoc = buildJobDoc(job);
  const where = job.location ? ` at ${job.location}` : "";
  const counts = { nearby: 0, matches: 0, general: 0 };

  const alerts: AlertInsert[] = (profiles ?? [])
    .filter((profile) => profile.user_id && !excludeUserIds.has(profile.user_id))
    .map((profile) => {
      const km = distanceBetween(profile.location, job.location);

      if (km !== null && km <= NEAR_ME_RADIUS_KM) {
        counts.nearby += 1;
        return {
          user_id: profile.user_id,
          type: "NEARBY_JOB" as const,
          title: "New job near you",
          message: `${job.title}${where} · ${formatDistance(km)} from ${profile.location}`,
          job_id: job.id,
        };
      }

      // "Matches your profile" is only said to applicants who have a resume to compare.
      if (!profile.resume_url) {
        counts.general += 1;
        return {
          user_id: profile.user_id,
          type: "NEW_JOB" as const,
          title: "New job published",
          message: `${job.title}${where}`,
          job_id: job.id,
        };
      }

      const text = scoreCandidate({
        profileDoc: buildProfileDoc(profile),
        positionText: buildPositionText(profile),
        jobDoc,
        jobTitle: job.title ?? "",
        corpusDocs: corpus,
      }).textScore;
      const score = combineScore(text, km);
      if (score >= JOB_MATCH_THRESHOLD) {
        counts.matches += 1;
        return {
          user_id: profile.user_id,
          type: "JOB_MATCH" as const,
          title: "New job that matches your profile",
          message: `${job.title}${where} · ${score}% match`,
          job_id: job.id,
        };
      }

      counts.general += 1;
      return {
        user_id: profile.user_id,
        type: "NEW_JOB" as const,
        title: "New job published",
        message: `${job.title}${where}`,
        job_id: job.id,
      };
    });

  const error = await insertAlerts(supabase, alerts);
  if (error) throw new Error(error);

  return { notified: alerts.length, ...counts };
}

/**
 * Re-matching (AIplanning.md §6.1): when a job is published, re-engage past applicants who were
 * a decent fit for a similar role before but weren't hired for a branch/timing reason rather than
 * a skill gap. There's no stored "why rejected" reason in `applications`, so this is inferred: an
 * old application with status Rejected/On Hold, for a job in the same category, but a different
 * branch (or whose old posting is no longer open). Re-scores each candidate fresh against the NEW
 * job with the same TF-IDF engine `notifyNewJob` uses — no new model, no new threshold.
 *
 * Returns the set of user_ids notified here, so the caller can exclude them from the generic
 * "matches your profile" blast in [notifyNewJob] and avoid double-alerting the same person.
 */
export async function notifyNearMissPastApplicants(
  supabase: SupabaseClient,
  job: NewJob
): Promise<Set<string>> {
  // No FK relationship is registered in the schema cache for applications.job_id -> jobs.id
  // (confirmed: every other route in this codebase joins jobs/applications manually in code,
  // never via PostgREST embedding — `jobs!inner(...)` fails with "Could not find a relationship").
  // So this does the same: two queries, joined in JS.
  const { data: pastApplications, error } = await supabase
    .from("applications")
    .select("user_id, match_score, job_id")
    .in("status", ["Rejected", "On Hold"]);
  if (error) throw new Error(error.message);

  const oldJobIds = [...new Set((pastApplications ?? []).map((row) => row.job_id).filter(Boolean))];
  if (oldJobIds.length === 0) return new Set();

  const { data: oldJobs, error: oldJobsError } = await supabase
    .from("jobs")
    .select("id, category, branch_id, status, deadline")
    .in("id", oldJobIds)
    .eq("category", job.category ?? "");
  if (oldJobsError) throw new Error(oldJobsError.message);

  const oldJobsById = new Map((oldJobs ?? []).map((oldJob) => [oldJob.id, oldJob]));
  const today = new Date().toISOString().slice(0, 10);
  const candidatesByUser = new Map<string, { matchScore: number; oldCategory: string }>();

  for (const row of pastApplications ?? []) {
    const oldJob = row.job_id ? oldJobsById.get(row.job_id) : null;
    if (!row.user_id || !oldJob) continue;

    const differentBranch = (oldJob.branch_id ?? null) !== (job.branch_id ?? null);
    const oldPostingClosed = oldJob.status !== "published" || (oldJob.deadline && oldJob.deadline < today);
    if (!differentBranch && !oldPostingClosed) continue; // same branch, still open: a real skill rejection, not a near-miss

    const existing = candidatesByUser.get(row.user_id);
    const matchScore = row.match_score ?? 0;
    if (!existing || matchScore > existing.matchScore) {
      candidatesByUser.set(row.user_id, { matchScore, oldCategory: oldJob.category ?? job.category ?? "a similar" });
    }
  }

  if (candidatesByUser.size === 0) return new Set();

  const userIds = [...candidatesByUser.keys()];
  const [{ data: profiles, error: profileError }, { data: jobs }, { data: alreadyApplied }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, location, skills, desired_position, headline, about, work_experiences, education, resume_url")
      .in("user_id", userIds),
    supabase.from("jobs").select("*").eq("status", "published").limit(1000),
    supabase.from("applications").select("user_id").eq("job_id", job.id).in("user_id", userIds),
  ]);
  if (profileError) throw new Error(profileError.message);

  const alreadyAppliedIds = new Set((alreadyApplied ?? []).map((row) => row.user_id));
  const corpus = (jobs ?? []).map(buildJobDoc);
  const jobDoc = buildJobDoc(job);
  const where = job.location ? ` at ${job.location}` : "";

  const alerts: AlertInsert[] = [];
  for (const profile of profiles ?? []) {
    if (!profile.user_id || alreadyAppliedIds.has(profile.user_id)) continue;

    const text = scoreCandidate({
      profileDoc: buildProfileDoc(profile),
      positionText: buildPositionText(profile),
      jobDoc,
      jobTitle: job.title ?? "",
      corpusDocs: corpus,
    }).textScore;
    const score = combineScore(text, distanceBetween(profile.location, job.location));
    if (score < JOB_MATCH_THRESHOLD) continue;

    const { oldCategory } = candidatesByUser.get(profile.user_id)!;
    alerts.push({
      user_id: profile.user_id,
      type: "RECOMMENDED_JOB",
      title: "A role that might suit you just opened",
      message: `You were a strong candidate for a similar ${oldCategory} role before — ${job.title}${where} just opened, might be a better fit.`,
      job_id: job.id,
    });
  }

  const insertError = await insertAlerts(supabase, alerts);
  if (insertError) throw new Error(insertError);

  return new Set(alerts.map((alert) => alert.user_id));
}

/** Alert for an applicant when HR moves their application to another step of the pipeline. */
export function applicationStatusAlert(
  userId: string,
  jobId: string | null,
  jobTitle: string | null,
  status: string,
  applicationId: string | null
): AlertInsert | null {
  if (!isKnownStatus(status)) return null;
  const content = statusContent(status, jobTitle);
  return {
    user_id: userId,
    type: "APPLICATION_UPDATE",
    job_id: jobId,
    application_id: applicationId,
    title: content.title,
    message: content.alert,
  };
}
