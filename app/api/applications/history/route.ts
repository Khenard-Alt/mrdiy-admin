import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { statusLabel } from "@/lib/pipeline";

/**
 * Every application one person has ever submitted to MR.DIY, across every branch and job —
 * "has this applicant worked here before, and where" (ADMIN_MAJOR_PLAN.md §U2/§U3). A branch
 * manager only sees the slice that happened at their own branch; HR/super_admin see everything.
 */
export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("applications")
    .select(
      "id, job_id, branch_id, status, created_at, updated_at, contract_start_date, contract_end_date, resignation_date, last_working_day, actual_last_day, termination_reason"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (session.role === "branch_manager") {
    if (!session.branchId) {
      return NextResponse.json({ history: [] });
    }
    query = query.eq("branch_id", session.branchId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications = rows ?? [];
  const jobIds = [...new Set(applications.map((a) => a.job_id).filter(Boolean))];
  const branchIds = [...new Set(applications.map((a) => a.branch_id).filter(Boolean))];

  const [jobsResult, branchesResult] = await Promise.all([
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const jobMap = new Map((jobsResult.data ?? []).map((j) => [j.id, j.title]));
  const branchMap = new Map((branchesResult.data ?? []).map((b) => [b.id, b.name]));

  return NextResponse.json({
    history: applications.map((application) => ({
      id: application.id,
      jobTitle: jobMap.get(application.job_id) ?? null,
      branchName: branchMap.get(application.branch_id) ?? null,
      status: application.status,
      statusLabel: statusLabel(application.status),
      appliedAt: application.created_at,
      updatedAt: application.updated_at,
      contractStartDate: application.contract_start_date,
      contractEndDate: application.contract_end_date,
      resignationDate: application.resignation_date,
      lastWorkingDay: application.last_working_day,
      actualLastDay: application.actual_last_day,
      terminationReason: application.termination_reason,
    })),
  });
}
