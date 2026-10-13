import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

/**
 * Every interview within a date range (for the calendar page) — branch-scoped the
 * same way as everything else (ADMIN_MAJOR_PLAN.md §D). Query params: `from`, `to`
 * (YYYY-MM-DD, inclusive), typically one calendar month at a time.
 */
export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)." }, { status: 400 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("interviews")
    .select("id, application_id, user_id, job_id, scheduled_at, venue, mode, meeting_link, status, applicant_response")
    .in("status", ["Scheduled", "Rescheduled", "Completed"])
    .gte("scheduled_at", `${from}T00:00:00`)
    .lte("scheduled_at", `${to}T23:59:59`)
    .order("scheduled_at", { ascending: true });

  if (session.role === "branch_manager") {
    if (!session.branchId) {
      return NextResponse.json({ interviews: [] });
    }
    const { data: ownBranchApps } = await supabase
      .from("applications")
      .select("id")
      .eq("branch_id", session.branchId);
    const ownIds = (ownBranchApps ?? []).map((item) => item.id);
    query = ownIds.length > 0 ? query.in("application_id", ownIds) : query.eq("application_id", "");
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const interviews = rows ?? [];
  const jobIds = [...new Set(interviews.map((i) => i.job_id).filter(Boolean))];
  const userIds = [...new Set(interviews.map((i) => i.user_id).filter(Boolean))];

  const [jobsResult, profilesResult] = await Promise.all([
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    userIds.length > 0
      ? supabase.from("profiles").select("id:user_id, full_name").in("user_id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const jobMap = new Map((jobsResult.data ?? []).map((j) => [j.id, j.title]));
  const profileMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p.full_name]));

  return NextResponse.json({
    interviews: interviews.map((i) => ({
      id: i.id,
      applicationId: i.application_id,
      scheduledAt: i.scheduled_at,
      venue: i.venue,
      mode: i.mode,
      meetingLink: i.meeting_link,
      status: i.status,
      applicantResponse: i.applicant_response,
      jobTitle: jobMap.get(i.job_id) ?? null,
      applicantName: profileMap.get(i.user_id) ?? null,
    })),
  });
}
