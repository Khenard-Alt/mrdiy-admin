import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const isBranchManager = session.role === "branch_manager";

  let applicationsQuery = supabase
    .from("applications")
    .select("id, user_id, job_id, status")
    .order("id", { ascending: false });

  // A branch manager's dashboard reflects only their own branch — job postings
  // are company-wide and not theirs to manage, so that count is left out entirely.
  if (isBranchManager) {
    applicationsQuery = applicationsQuery.eq("branch_id", session.branchId);
  }

  const [jobsCountResult, applicationsResult] = await Promise.all([
    isBranchManager
      ? Promise.resolve({ count: null })
      : supabase.from("jobs").select("*", { count: "exact", head: true }),
    applicationsQuery,
  ]);

  if (applicationsResult.error) {
    return NextResponse.json({ error: applicationsResult.error.message }, { status: 500 });
  }

  const rows = applicationsResult.data ?? [];

  const jobIds = [...new Set(rows.map((app) => app.job_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((app) => app.user_id).filter(Boolean))];

  const [jobTitlesResult, profilesResult] = await Promise.all([
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase.from("profiles").select("id:user_id, full_name, email").in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const jobs = jobTitlesResult.data ?? [];
  const profiles = profilesResult.data ?? [];

  const jobMap = new Map<string, string>();
  jobs.forEach((job) => {
    if (job.title) jobMap.set(job.id, job.title);
  });

  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  profiles.forEach((profile) => {
    profileMap.set(profile.id, { full_name: profile.full_name, email: profile.email });
  });

  const combinedApplications = rows.map((application) => {
    const profile = profileMap.get(application.user_id);
    return {
      id: application.id,
      user_id: application.user_id,
      job_id: application.job_id,
      applied_at: null,
      status: application.status,
      job_title: jobMap.get(application.job_id) ?? null,
      applicant_name: profile?.full_name ?? null,
      applicant_email: profile?.email ?? null,
    };
  });

  // ── Upcoming interviews (next 10, soonest first) ────────────────────────
  let interviewQuery = supabase
    .from("interviews")
    .select("id, application_id, user_id, job_id, scheduled_at, venue, mode, meeting_link, applicant_response")
    .in("status", ["Scheduled", "Rescheduled"])
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);

  // A branch manager only sees interviews for applications in their own branch
  // — `rows` is already scoped to it above, so it doubles as that id list.
  if (isBranchManager) {
    const ownIds = rows.map((item) => item.id);
    interviewQuery = ownIds.length > 0 ? interviewQuery.in("application_id", ownIds) : interviewQuery.eq("application_id", "");
  }

  const { data: upcomingRaw } = await interviewQuery;
  const interviewRows = upcomingRaw ?? [];

  const interviewJobIds = [...new Set(interviewRows.map((item) => item.job_id).filter(Boolean))];
  const interviewUserIds = [...new Set(interviewRows.map((item) => item.user_id).filter(Boolean))];

  const [interviewJobsResult, interviewProfilesResult] = await Promise.all([
    interviewJobIds.length > 0
      ? supabase.from("jobs").select("id, title").in("id", interviewJobIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    interviewUserIds.length > 0
      ? supabase.from("profiles").select("id:user_id, full_name").in("user_id", interviewUserIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const interviewJobMap = new Map((interviewJobsResult.data ?? []).map((job) => [job.id, job.title]));
  const interviewProfileMap = new Map((interviewProfilesResult.data ?? []).map((profile) => [profile.id, profile.full_name]));

  const upcomingInterviews = interviewRows.map((interview) => ({
    id: interview.id,
    applicationId: interview.application_id,
    scheduledAt: interview.scheduled_at,
    venue: interview.venue,
    mode: interview.mode,
    meetingLink: interview.meeting_link,
    applicantResponse: interview.applicant_response,
    jobTitle: interviewJobMap.get(interview.job_id) ?? null,
    applicantName: interviewProfileMap.get(interview.user_id) ?? null,
  }));

  return NextResponse.json({
    role: session.role,
    totalJobs: isBranchManager ? null : (jobsCountResult.count ?? 0),
    totalApplications: rows.length,
    pendingApplications: rows.filter((app) => (app.status ?? "Pending").toLowerCase() === "pending").length,
    approvedApplications: rows.filter((app) => {
      const value = (app.status ?? "").toLowerCase();
      return value === "approved" || value === "hired";
    }).length,
    recentApplications: combinedApplications.slice(0, 5),
    upcomingInterviews,
  });
}
