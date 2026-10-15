import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { hasRole } from "@/lib/adminSession";
import { notifyNewJob, notifyNearMissPastApplicants } from "@/lib/notifications";

function isPublished(status: string | null | undefined) {
  return (status ?? "").toLowerCase() === "published";
}

/** Saving the job must never fail because notifying applicants failed; report it as a warning. */
async function notifySafely(
  supabase: ReturnType<typeof createAdminClient>,
  job: Parameters<typeof notifyNewJob>[1]
) {
  try {
    const nearMissUserIds = await notifyNearMissPastApplicants(supabase, job);
    return { notified: await notifyNewJob(supabase, job, nearMissUserIds) };
  } catch (error) {
    return {
      warning: `Job saved, but applicants could not be notified: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    };
  }
}

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (hasRole(session, "branch_manager")) {
    return NextResponse.json({ error: "Job postings are managed by HR, not by branch managers." }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, description, responsibilities, requirements, benefits, location, salary, status, created_at, salary_type, openings, deadline, branch_id, job_type, category, level, contract_duration_months"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs = await attachVacancyInfo(supabase, await autoCloseExpiredOrFilled(supabase, data ?? []));

  return NextResponse.json({ jobs });
}

type JobRow = {
  id: string;
  status: string | null;
  openings: number | null;
  deadline: string | null;
  [key: string]: unknown;
};

/** How many jobs are Hired per job id, for every job that has an openings target. */
async function hiredCountsByJob(
  supabase: ReturnType<typeof createAdminClient>,
  jobs: JobRow[]
): Promise<Map<string, number>> {
  const withOpenings = jobs.filter((job) => job.openings !== null && job.openings !== undefined);
  if (withOpenings.length === 0) return new Map();

  const { data: hired } = await supabase
    .from("applications")
    .select("job_id")
    .eq("status", "Hired")
    .in(
      "job_id",
      withOpenings.map((j) => j.id)
    );

  return (hired ?? []).reduce((map, row) => {
    map.set(row.job_id, (map.get(row.job_id) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
}

/**
 * A published job automatically becomes Closed once its deadline has passed, or once
 * enough applicants have been Hired to fill its openings. Checked lazily here (on each
 * admin list load) instead of a cron job, so the mobile app's "published" filter picks
 * up the change on its next fetch.
 */
async function autoCloseExpiredOrFilled(
  supabase: ReturnType<typeof createAdminClient>,
  jobs: JobRow[]
): Promise<JobRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  const pastDeadline = jobs.filter(
    (job) => job.status === "published" && job.deadline && job.deadline < today
  );

  const limitedOpenings = jobs.filter(
    (job) => job.status === "published" && job.openings !== null && job.openings !== undefined
  );

  const hiredCounts = await hiredCountsByJob(supabase, limitedOpenings);

  const filled = limitedOpenings.filter((job) => (hiredCounts.get(job.id) ?? 0) >= (job.openings ?? 0));

  const toClose = [...new Set([...pastDeadline, ...filled].map((job) => job.id))];
  if (toClose.length === 0) return jobs;

  await supabase.from("jobs").update({ status: "closed" }).in("id", toClose);

  return jobs.map((job) => (toClose.includes(job.id) ? { ...job, status: "closed" } : job));
}

/**
 * Adds `filled` (count of Hired applicants) and `closedReason` ("filled" | "deadline" | null)
 * to each job so the admin table can show vacancy progress and why a job closed.
 */
async function attachVacancyInfo(
  supabase: ReturnType<typeof createAdminClient>,
  jobs: JobRow[]
): Promise<JobRow[]> {
  const hiredCounts = await hiredCountsByJob(supabase, jobs);
  const today = new Date().toISOString().slice(0, 10);

  return jobs.map((job) => {
    const filled = hiredCounts.get(job.id) ?? 0;

    let closedReason: "filled" | "deadline" | null = null;
    if (job.status === "closed") {
      if (job.openings !== null && job.openings !== undefined && filled >= job.openings) {
        closedReason = "filled";
      } else if (job.deadline && job.deadline < today) {
        closedReason = "deadline";
      }
    }

    return { ...job, filled, closedReason };
  });
}

export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (hasRole(session, "branch_manager")) {
    return NextResponse.json({ error: "Job postings are managed by HR, not by branch managers." }, { status: 403 });
  }

  const body = await request.json();
  const supabase = createAdminClient();

  const { data: created, error } = await supabase
    .from("jobs")
    .insert({
      title: body.title,
      description: body.description,
      responsibilities: body.responsibilities,
      requirements: body.requirements,
      benefits: body.benefits,
      location: body.location,
      salary: body.salary,
      salary_type: body.salary_type,
      status: body.status,
      job_type: body.jobType,
      category: body.category,
      level: body.level,
      openings: body.openings || null,
      deadline: body.deadline || null,
      branch_id: body.branchId || null,
      contract_duration_months: body.contractDurationMonths || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A job saved as published tells applicants right away.
  return NextResponse.json({
    ok: true,
    ...(isPublished(created?.status) ? await notifySafely(supabase, created) : {}),
  });
}

export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (hasRole(session, "branch_manager")) {
    return NextResponse.json({ error: "Job postings are managed by HR, not by branch managers." }, { status: 403 });
  }

  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: "Job id is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: before } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", body.id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("jobs")
    .update({
      title: body.title,
      description: body.description,
      responsibilities: body.responsibilities,
      requirements: body.requirements,
      benefits: body.benefits,
      location: body.location,
      salary: body.salary,
      salary_type: body.salary_type,
      status: body.status,
      job_type: body.jobType,
      category: body.category,
      level: body.level,
      openings: body.openings || null,
      deadline: body.deadline || null,
      branch_id: body.branchId || null,
      contract_duration_months: body.contractDurationMonths || null,
    })
    .eq("id", body.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only the moment a job becomes published notifies applicants; later edits do not.
  const justPublished = !isPublished(before?.status) && isPublished(updated?.status);

  return NextResponse.json({
    ok: true,
    ...(justPublished && updated ? await notifySafely(supabase, updated) : {}),
  });
}

export async function DELETE(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (hasRole(session, "branch_manager")) {
    return NextResponse.json({ error: "Job postings are managed by HR, not by branch managers." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Job id is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
