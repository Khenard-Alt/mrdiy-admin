import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { notifyNewJob } from "@/lib/notifications";

function isPublished(status: string | null | undefined) {
  return (status ?? "").toLowerCase() === "published";
}

/** Saving the job must never fail because notifying applicants failed; report it as a warning. */
async function notifySafely(
  supabase: ReturnType<typeof createAdminClient>,
  job: Parameters<typeof notifyNewJob>[1]
) {
  try {
    return { notified: await notifyNewJob(supabase, job) };
  } catch (error) {
    return {
      warning: `Job saved, but applicants could not be notified: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    };
  }
}

export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, description, responsibilities, requirements, benefits, location, salary, status, created_at, salary_type, openings, deadline, branch_id"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs = await autoCloseExpiredOrFilled(supabase, data ?? []);

  return NextResponse.json({ jobs });
}

type JobRow = {
  id: string;
  status: string | null;
  openings: number | null;
  deadline: string | null;
  [key: string]: unknown;
};

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

  let hiredCounts = new Map<string, number>();
  if (limitedOpenings.length > 0) {
    const { data: hired } = await supabase
      .from("applications")
      .select("job_id")
      .eq("status", "Hired")
      .in(
        "job_id",
        limitedOpenings.map((j) => j.id)
      );
    hiredCounts = (hired ?? []).reduce((map, row) => {
      map.set(row.job_id, (map.get(row.job_id) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  }

  const filled = limitedOpenings.filter((job) => (hiredCounts.get(job.id) ?? 0) >= (job.openings ?? 0));

  const toClose = [...new Set([...pastDeadline, ...filled].map((job) => job.id))];
  if (toClose.length === 0) return jobs;

  await supabase.from("jobs").update({ status: "closed" }).in("id", toClose);

  return jobs.map((job) => (toClose.includes(job.id) ? { ...job, status: "closed" } : job));
}

export async function POST(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
