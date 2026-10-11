import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [jobsCountResult, applicationsResult] = await Promise.all([
    supabase.from("jobs").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("id, user_id, job_id, status").order("id", { ascending: false }),
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
      ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
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

  return NextResponse.json({
    totalJobs: jobsCountResult.count ?? 0,
    totalApplications: rows.length,
    pendingApplications: rows.filter((app) => (app.status ?? "Pending").toLowerCase() === "pending").length,
    approvedApplications: rows.filter((app) => {
      const value = (app.status ?? "").toLowerCase();
      return value === "approved" || value === "hired";
    }).length,
    recentApplications: combinedApplications.slice(0, 5),
  });
}
