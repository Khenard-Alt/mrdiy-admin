import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { normalizeStatus } from "@/lib/pipeline";

function toCsvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const format = new URL(request.url).searchParams.get("format");

  if (format === "csv") {
    let csvQuery = supabase
      .from("applications")
      .select("id, user_id, job_id, status, match_score, created_at, updated_at, branch_id")
      .order("created_at", { ascending: false });

    if (session.role === "branch_manager") {
      if (!session.branchId) return new NextResponse("", { headers: { "Content-Type": "text/csv" } });
      csvQuery = csvQuery.eq("branch_id", session.branchId);
    }

    const { data: rows, error: csvError } = await csvQuery;
    if (csvError) return NextResponse.json({ error: csvError.message }, { status: 500 });

    const jobIds = [...new Set((rows ?? []).map((r) => r.job_id).filter(Boolean))];
    const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))];
    const branchIds = [...new Set((rows ?? []).map((r) => r.branch_id).filter(Boolean))];

    const [{ data: jobs }, { data: profiles }, { data: branches }] = await Promise.all([
      jobIds.length > 0 ? supabase.from("jobs").select("id, title").in("id", jobIds) : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      branchIds.length > 0
        ? supabase.from("branches").select("id, name").in("id", branchIds)
        : Promise.resolve({ data: [] }),
    ]);

    const header = ["Applicant", "Email", "Job", "Branch", "Status", "Match %", "Applied At"];
    const lines = [header.map(toCsvField).join(",")];

    (rows ?? []).forEach((row) => {
      const profile = (profiles ?? []).find((p) => p.user_id === row.user_id);
      const job = (jobs ?? []).find((j) => j.id === row.job_id);
      const branch = (branches ?? []).find((b) => b.id === row.branch_id);
      lines.push(
        [
          profile?.full_name ?? "",
          profile?.email ?? "",
          job?.title ?? "",
          branch?.name ?? "",
          normalizeStatus(row.status),
          row.match_score ?? "",
          row.created_at ?? "",
        ]
          .map(toCsvField)
          .join(",")
      );
    });

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  let query = supabase
    .from("applications")
    .select("id, job_id, status, match_score, created_at, updated_at, branch_id");

  if (session.role === "branch_manager") {
    if (!session.branchId) {
      return NextResponse.json({
        funnel: { applied: 0, shortlisted: 0, interviewed: 0, hired: 0 },
        byBranch: [],
        byJob: [],
        averageMatchScore: null,
        averageDaysToHire: null,
        topJobs: [],
      });
    }
    query = query.eq("branch_id", session.branchId);
  }

  const { data: applications, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = applications ?? [];

  const [jobsResult, branchesResult] = await Promise.all([
    supabase.from("jobs").select("id, title"),
    supabase.from("branches").select("id, name"),
  ]);

  const jobs = jobsResult.data ?? [];
  const branches = branchesResult.data ?? [];

  // Funnel: every application has reached at least these stages, in order.
  const statuses = rows.map((r) => normalizeStatus(r.status));
  const funnel = {
    applied: rows.length,
    shortlisted: statuses.filter((s) =>
      ["Shortlisted", "Interview Scheduled", "Hired"].includes(s)
    ).length,
    interviewed: statuses.filter((s) => ["Interview Scheduled", "Hired"].includes(s)).length,
    hired: statuses.filter((s) => s === "Hired").length,
  };

  const matchScores = rows.map((r) => r.match_score).filter((v): v is number => typeof v === "number");
  const averageMatchScore =
    matchScores.length > 0 ? Math.round(matchScores.reduce((a, b) => a + b, 0) / matchScores.length) : null;

  const hiredRows = rows.filter((r) => normalizeStatus(r.status) === "Hired" && r.created_at && r.updated_at);
  const daysToHire = hiredRows.map(
    (r) => (new Date(r.updated_at!).getTime() - new Date(r.created_at!).getTime()) / (1000 * 60 * 60 * 24)
  );
  const averageDaysToHire =
    daysToHire.length > 0 ? Math.round((daysToHire.reduce((a, b) => a + b, 0) / daysToHire.length) * 10) / 10 : null;

  const byBranch = branches
    .map((branch) => {
      const branchRows = rows.filter((r) => r.branch_id === branch.id);
      return {
        branchId: branch.id,
        branchName: branch.name,
        applied: branchRows.length,
        hired: branchRows.filter((r) => normalizeStatus(r.status) === "Hired").length,
      };
    })
    .filter((b) => b.applied > 0)
    .sort((a, b) => b.applied - a.applied);

  const byJob = jobs
    .map((job) => {
      const jobRows = rows.filter((r) => r.job_id === job.id);
      return {
        jobId: job.id,
        jobTitle: job.title ?? "Untitled",
        applied: jobRows.length,
        hired: jobRows.filter((r) => normalizeStatus(r.status) === "Hired").length,
      };
    })
    .filter((j) => j.applied > 0)
    .sort((a, b) => b.applied - a.applied);

  const topJobs = byJob.slice(0, 5);

  return NextResponse.json({
    funnel,
    byBranch,
    byJob,
    topJobs,
    averageMatchScore,
    averageDaysToHire,
  });
}
