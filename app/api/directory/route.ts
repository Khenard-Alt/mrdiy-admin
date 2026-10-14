import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { hasRole } from "@/lib/adminSession";
import { normalizeStatus, statusLabel } from "@/lib/pipeline";

/**
 * Every person who has ever applied to MR.DIY — one row per person (their latest application
 * stands in for the row), not one row per application — with filtering and pagination
 * (ADMIN_MAJOR_PLAN.md §U1). HR/super_admin only: a branch manager already has their own
 * branch-scoped views (/applications, /employees); this is the company-wide picture.
 *
 * The table scale here (one retail chain's applicants) comfortably fits in memory, so filtering
 * and pagination happen in JS after one fetch, the same way the rest of this codebase works —
 * no cursor/offset query against Postgres, no new DB function.
 */
export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!hasRole(session, "super_admin", "hr_officer")) {
    return NextResponse.json({ error: "HR or super admin access only." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") ?? "20", 10) || 20));
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const statusFilter = params.get("status") ?? "";
  const branchFilter = params.get("branchId") ?? "";
  const jobFilter = params.get("jobId") ?? "";
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";

  const supabase = createAdminClient();

  const { data: applicationRows, error } = await supabase
    .from("applications")
    .select("id, user_id, job_id, branch_id, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications = applicationRows ?? [];
  if (applications.length === 0) {
    return NextResponse.json({ people: [], total: 0, page, pageSize });
  }

  const userIds = [...new Set(applications.map((a) => a.user_id).filter(Boolean))];
  const jobIds = [...new Set(applications.map((a) => a.job_id).filter(Boolean))];
  const branchIds = [...new Set(applications.map((a) => a.branch_id).filter(Boolean))];

  const [profilesResult, jobsResult, branchesResult] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("user_id, full_name, email, phone").in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string; full_name: string | null; email: string | null; phone: string | null }[] }),
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const profileMap = new Map((profilesResult.data ?? []).map((p) => [p.user_id, p]));
  const jobMap = new Map((jobsResult.data ?? []).map((j) => [j.id, j.title]));
  const branchMap = new Map((branchesResult.data ?? []).map((b) => [b.id, b.name]));

  // Group by user_id — applications are already newest-first, so the first one seen per
  // user is their latest, and it represents the person's row in the directory.
  type PersonRow = {
    userId: string;
    latestApplicationId: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    latestJobTitle: string | null;
    latestBranchName: string | null;
    latestBranchId: string | null;
    latestJobId: string | null;
    latestStatus: string;
    latestStatusLabel: string;
    latestAppliedAt: string;
    applicationCount: number;
  };

  const people = new Map<string, PersonRow>();
  for (const application of applications) {
    if (!application.user_id) continue;

    const existing = people.get(application.user_id);
    if (existing) {
      existing.applicationCount += 1;
      continue;
    }

    const profile = profileMap.get(application.user_id);
    people.set(application.user_id, {
      userId: application.user_id,
      latestApplicationId: application.id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      latestJobTitle: jobMap.get(application.job_id) ?? null,
      latestBranchName: application.branch_id ? branchMap.get(application.branch_id) ?? null : null,
      latestBranchId: application.branch_id,
      latestJobId: application.job_id,
      latestStatus: application.status ?? "Pending",
      latestStatusLabel: statusLabel(application.status),
      latestAppliedAt: application.created_at,
      applicationCount: 1,
    });
  }

  let rows = [...people.values()];

  if (search) {
    rows = rows.filter(
      (row) =>
        (row.fullName ?? "").toLowerCase().includes(search) ||
        (row.email ?? "").toLowerCase().includes(search) ||
        (row.phone ?? "").toLowerCase().includes(search)
    );
  }
  if (statusFilter) {
    rows = rows.filter((row) => normalizeStatus(row.latestStatus) === statusFilter);
  }
  if (branchFilter) {
    rows = rows.filter((row) => row.latestBranchId === branchFilter);
  }
  if (jobFilter) {
    rows = rows.filter((row) => row.latestJobId === jobFilter);
  }
  if (dateFrom) {
    rows = rows.filter((row) => row.latestAppliedAt.slice(0, 10) >= dateFrom);
  }
  if (dateTo) {
    rows = rows.filter((row) => row.latestAppliedAt.slice(0, 10) <= dateTo);
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);

  return NextResponse.json({ people: paged, total, page, pageSize });
}
