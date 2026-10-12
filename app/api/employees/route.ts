import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

/**
 * The Hired applicants a branch manager actually holds — their contract window and
 * whether the employment contract has been countersigned yet. HR/Super Admin see
 * everyone; a branch manager sees only their own branch (ADMIN_MAJOR_PLAN.md §P).
 */
export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("applications")
    .select(
      "id, user_id, job_id, branch_id, contract_start_date, contract_end_date, manager_signature_url, manager_signed_at, updated_at"
    )
    .eq("status", "Hired")
    .order("contract_end_date", { ascending: true, nullsFirst: false });

  if (session.role === "branch_manager") {
    if (!session.branchId) {
      return NextResponse.json({ employees: [] });
    }
    query = query.eq("branch_id", session.branchId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications = rows ?? [];
  const userIds = [...new Set(applications.map((a) => a.user_id).filter(Boolean))];
  const jobIds = [...new Set(applications.map((a) => a.job_id).filter(Boolean))];
  const branchIds = [...new Set(applications.map((a) => a.branch_id).filter(Boolean))];

  const [profilesResult, jobsResult, branchesResult] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id:user_id, full_name, email, phone").in("user_id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] }),
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title, contract_duration_months").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null; contract_duration_months: number | null }[] }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const profileMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));
  const jobMap = new Map((jobsResult.data ?? []).map((j) => [j.id, j]));
  const branchMap = new Map((branchesResult.data ?? []).map((b) => [b.id, b.name]));

  const today = new Date().toISOString().slice(0, 10);

  const employees = applications.map((app) => {
    const profile = profileMap.get(app.user_id);
    const job = jobMap.get(app.job_id);
    const daysLeft = app.contract_end_date
      ? Math.ceil((new Date(app.contract_end_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      applicationId: app.id,
      applicantName: profile?.full_name ?? null,
      applicantEmail: profile?.email ?? null,
      applicantPhone: profile?.phone ?? null,
      jobTitle: job?.title ?? null,
      isContractual: Boolean(job?.contract_duration_months),
      branchName: branchMap.get(app.branch_id) ?? null,
      contractStartDate: app.contract_start_date,
      contractEndDate: app.contract_end_date,
      daysLeft,
      signed: Boolean(app.manager_signature_url),
      signedAt: app.manager_signed_at,
      hiredAt: app.updated_at,
    };
  });

  return NextResponse.json({ employees });
}
