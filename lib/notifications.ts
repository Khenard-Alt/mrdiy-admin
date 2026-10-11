import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeMatch,
  buildJobDoc,
  buildProfileDoc,
  combineScore,
  type JobDocFields,
} from "@/lib/matching";
import { distanceBetween, formatDistance, NEAR_ME_RADIUS_KM } from "@/lib/location";
import { sendPush } from "@/lib/push";

/** Applicants whose combined match score for a new job reaches this get a "matches you" alert. */
export const JOB_MATCH_THRESHOLD = 50;

export type AlertType =
  | "NEW_JOB"
  | "NEARBY_JOB"
  | "JOB_MATCH"
  | "APPLICATION_UPDATE"
  | "MESSAGE"
  | "SYSTEM";

export type AlertInsert = {
  user_id: string;
  type: AlertType;
  title: string;
  message: string;
  job_id?: string | null;
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
      },
    }))
  );
  return null;
}

type NewJob = JobDocFields & { id: string; location?: string | null };

/**
 * Tells every applicant about a newly published job. One alert per applicant:
 * "near you" if a branch is within the radius, else "matches your profile", else a plain "new job".
 */
export async function notifyNewJob(supabase: SupabaseClient, job: NewJob) {
  const [{ data: profiles, error: profileError }, { data: jobs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, location, skills, desired_position, headline, about, work_experiences, education"),
    supabase.from("jobs").select("*").eq("status", "published").limit(1000),
  ]);

  if (profileError) throw new Error(profileError.message);

  const corpus = (jobs ?? []).map(buildJobDoc);
  const jobDoc = buildJobDoc(job);
  const where = job.location ? ` at ${job.location}` : "";
  const counts = { nearby: 0, matches: 0, general: 0 };

  const alerts: AlertInsert[] = (profiles ?? [])
    .filter((profile) => profile.user_id)
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

      const text = analyzeMatch(buildProfileDoc(profile), jobDoc, corpus).textScore;
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

const STATUS_ALERTS: Record<string, (jobTitle: string) => { title: string; message: string }> = {
  pending: (jobTitle) => ({
    title: "Application pending",
    message: `Your application for ${jobTitle} is pending. We will update you once it is reviewed.`,
  }),
  reviewed: (jobTitle) => ({
    title: "Application under review",
    message: `Our team is reviewing your application for ${jobTitle}. We will update you once a decision is made.`,
  }),
  approved: (jobTitle) => ({
    title: "Application accepted",
    message: `Congratulations! Your application for ${jobTitle} was accepted. Check your messages for the next steps.`,
  }),
  rejected: (jobTitle) => ({
    title: "Application rejected",
    message: `Thank you for applying for ${jobTitle}. We decided to proceed with other candidates this time.`,
  }),
};

// The admin buttons are Pending / Reviewed / Approved / Rejected; the applicant sees friendlier names.
const STATUS_ALIASES: Record<string, string> = {
  "under review": "reviewed",
  accepted: "approved",
};

/** Alert for an applicant when HR changes their application status. */
export function applicationStatusAlert(
  userId: string,
  jobId: string | null,
  jobTitle: string | null,
  status: string
): AlertInsert | null {
  const key = status.toLowerCase();
  const build = STATUS_ALERTS[STATUS_ALIASES[key] ?? key];
  if (!build) return null;
  return {
    user_id: userId,
    type: "APPLICATION_UPDATE",
    job_id: jobId,
    ...build(jobTitle ?? "this job"),
  };
}
