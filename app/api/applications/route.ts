import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { applicationStatusAlert, insertAlerts } from "@/lib/notifications";
import {
  isKnownStatus,
  normalizeStatus,
  PRE_EMPLOYMENT_REQUIREMENTS,
  REQUIREMENT_DUE_DAYS,
  statusContent,
} from "@/lib/pipeline";
import { sendApplicantEmail, type EmailKind, type EmailResult } from "@/lib/email";

// Signed URLs are valid for 1 hour; cache for less than that so a refresh
// still gets a fresh URL well before the old one would actually expire.
const SIGNED_URL_CACHE_MS = 50 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("applications")
    .select(
      "id, user_id, job_id, resume_url, status, match_score, created_at, updated_at, assigned_to, branch_id, tags, transfer_status, transfer_offer_branch_id, contract_start_date, contract_end_date, resignation_date, last_working_day, actual_last_day, clearance_completed_at, final_pay_released_at, awol_absence_since, awol_notice1_sent_at, awol_explanation_deadline, awol_explanation_received_at, awol_explanation_text, termination_reason"
    )
    .order("created_at", { ascending: false });

  // A branch manager only ever sees applications routed to their own branch.
  if (session.role === "branch_manager") {
    if (!session.branchId) {
      return NextResponse.json({ applications: [] });
    }
    query = query.eq("branch_id", session.branchId);
  }

  const { data: applicationData, error: applicationError } = await query;

  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 500 });
  }

  const applicationRows = applicationData ?? [];

  if (applicationRows.length === 0) {
    return NextResponse.json({ applications: [] });
  }

  const profileIds = [...new Set(applicationRows.map((item) => item.user_id).filter(Boolean))];
  const jobIds = [...new Set(applicationRows.map((item) => item.job_id).filter(Boolean))];
  const assigneeIds = [...new Set(applicationRows.map((item) => item.assigned_to).filter(Boolean))];
  const branchIds = [
    ...new Set(
      [...applicationRows.map((item) => item.branch_id), ...applicationRows.map((item) => item.transfer_offer_branch_id)].filter(
        Boolean
      )
    ),
  ];

  const [profilesResult, jobsResult, assigneesResult, branchesResult] = await Promise.all([
    profileIds.length > 0
      ? supabase
          .from("profiles")
          .select("id:user_id, full_name, email, phone, location, resume_url, resume_name, resume_uploaded_at")
          .in("user_id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title, location, salary").in("id", jobIds)
      : Promise.resolve({ data: [], error: null }),
    assigneeIds.length > 0
      ? supabase.from("admin_users").select("id, full_name, username").in("id", assigneeIds)
      : Promise.resolve({ data: [], error: null }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) {
    return NextResponse.json({ error: profilesResult.error.message }, { status: 500 });
  }

  if (jobsResult.error) {
    return NextResponse.json({ error: jobsResult.error.message }, { status: 500 });
  }

  const profiles = profilesResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const assignees = assigneesResult.data ?? [];
  const branches = branchesResult.data ?? [];

  // Resume files live in a private storage bucket — resolve each stored
  // path to a short-lived signed URL the browser can actually load.
  const resumePaths = [
    ...new Set(
      [...applicationRows.map((a) => a.resume_url), ...profiles.map((p) => p.resume_url)]
        .filter((path): path is string => Boolean(path) && !path.startsWith("http"))
    ),
  ];

  // Reuse a cached signed URL per path instead of minting a new one on every
  // call. This endpoint is re-fetched on every realtime change to the
  // applications table (any status update, tag, hand-off...), and a brand
  // new URL each time changed the resume preview <iframe>'s src, reloading
  // it — which some browsers (set to download PDFs instead of previewing
  // them) turned into a repeated, unwanted download on every unrelated
  // action. A stable URL within the cache window keeps the iframe untouched.
  const now = Date.now();
  for (const [path, entry] of signedUrlCache) {
    if (entry.expiresAt <= now) signedUrlCache.delete(path);
  }

  const uncachedPaths = resumePaths.filter((path) => !signedUrlCache.has(path));

  if (uncachedPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage
      .from("resumes")
      .createSignedUrls(uncachedPaths, 60 * 60);

    (signedUrls ?? []).forEach((entry) => {
      if (entry.signedUrl && entry.path) {
        signedUrlCache.set(entry.path, {
          url: entry.signedUrl,
          expiresAt: now + SIGNED_URL_CACHE_MS,
        });
      }
    });
  }

  const signedUrlMap = new Map(
    resumePaths
      .filter((path) => signedUrlCache.has(path))
      .map((path) => [path, signedUrlCache.get(path)!.url])
  );

  function resolveResumeUrl(path: string | null) {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return signedUrlMap.get(path) ?? null;
  }

  const combined = applicationRows.map((application) => {
    const profile = profiles.find((item) => item.id === application.user_id) ?? null;
    return {
      ...application,
      resume_url: resolveResumeUrl(application.resume_url),
      profile: profile
        ? { ...profile, resume_url: resolveResumeUrl(profile.resume_url) }
        : null,
      job: jobs.find((item) => item.id === application.job_id) ?? null,
      assignee: assignees.find((item) => item.id === application.assigned_to) ?? null,
      branch: branches.find((item) => item.id === application.branch_id) ?? null,
      transferOfferBranch: branches.find((item) => item.id === application.transfer_offer_branch_id) ?? null,
    };
  });

  // Best-effort: let HR know when a Hired applicant's contract is about to end.
  // Never fails the page load if it errors.
  try {
    await remindContractsEnding(supabase, applicationRows);
  } catch {
    // ignore
  }

  // Best-effort: flag a resigned employee's final pay once it's overdue (DOLE
  // Labor Advisory 06-20: 30 days from the last working day).
  try {
    await remindFinalPayOverdue(supabase, applicationRows);
  } catch {
    // ignore
  }

  // Best-effort: flag a Hired applicant's pre-employment documents once any
  // of them pass their follow-up deadline (ADMIN_MAJOR_PLAN.md §T).
  try {
    await remindRequirementsOverdue(supabase, applicationRows);
  } catch {
    // ignore
  }

  return NextResponse.json({ applications: combined });
}

/**
 * Admin alert, once per application, when a Hired applicant's contract ends within
 * the next 14 days. Checked lazily on each applications list load (same pattern as
 * the jobs auto-close check) instead of a cron job.
 */
async function remindContractsEnding(
  supabase: ReturnType<typeof createAdminClient>,
  applications: { id: string; status: string | null; branch_id: string | null; contract_end_date?: string | null }[]
) {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);
  const soonStr = soon.toISOString().slice(0, 10);

  const ending = applications.filter(
    (application) =>
      normalizeStatus(application.status) === "Hired" &&
      application.contract_end_date &&
      application.contract_end_date >= today &&
      application.contract_end_date <= soonStr
  );
  if (ending.length === 0) return;

  const { data: existingAlerts } = await supabase
    .from("admin_alerts")
    .select("application_id")
    .eq("type", "CONTRACT_ENDING")
    .in(
      "application_id",
      ending.map((application) => application.id)
    );
  const alreadyAlerted = new Set((existingAlerts ?? []).map((row) => row.application_id));

  const toAlert = ending.filter((application) => !alreadyAlerted.has(application.id));
  if (toAlert.length === 0) return;

  const { data: admins } = await supabase
    .from("admin_users")
    .select("id, role, branch_id")
    .eq("is_active", true);

  const rows = toAlert.flatMap((application) =>
    (admins ?? [])
      .filter(
        (admin) =>
          admin.role === "super_admin" ||
          admin.role === "hr_officer" ||
          (admin.role === "branch_manager" && admin.branch_id === application.branch_id)
      )
      .map((admin) => ({
        admin_id: admin.id,
        type: "CONTRACT_ENDING",
        title: "Contract ending soon",
        message: `A hired applicant's contract ends on ${application.contract_end_date}.`,
        application_id: application.id,
      }))
  );

  if (rows.length > 0) {
    await supabase.from("admin_alerts").insert(rows);
  }
}

/**
 * Admin alert, once per application, when a resigned employee's final pay is
 * overdue: more than 30 days since their last working day with no
 * final_pay_released_at recorded (DOLE Labor Advisory 06-20 — ADMIN_MAJOR_PLAN.md
 * §Q). A missed statutory deadline, not just a reminder, so it's worth flagging
 * even though nothing in the UI sets final_pay_released_at yet.
 */
async function remindFinalPayOverdue(
  supabase: ReturnType<typeof createAdminClient>,
  applications: {
    id: string;
    status: string | null;
    branch_id: string | null;
    last_working_day?: string | null;
    actual_last_day?: string | null;
    final_pay_released_at?: string | null;
  }[]
) {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() - 30);
  const deadlineStr = deadline.toISOString().slice(0, 10);

  const overdue = applications.filter((application) => {
    if (normalizeStatus(application.status) !== "Resigned" || application.final_pay_released_at) return false;
    // The real last day worked is the legal trigger once known — it can be
    // earlier than the planned last_working_day (incomplete notice period).
    const lastDay = application.actual_last_day ?? application.last_working_day;
    return Boolean(lastDay) && lastDay! <= deadlineStr;
  });
  if (overdue.length === 0) return;

  const { data: existingAlerts } = await supabase
    .from("admin_alerts")
    .select("application_id")
    .eq("type", "FINAL_PAY_OVERDUE")
    .in(
      "application_id",
      overdue.map((application) => application.id)
    );
  const alreadyAlerted = new Set((existingAlerts ?? []).map((row) => row.application_id));

  const toAlert = overdue.filter((application) => !alreadyAlerted.has(application.id));
  if (toAlert.length === 0) return;

  const { data: admins } = await supabase
    .from("admin_users")
    .select("id, role, branch_id")
    .eq("is_active", true);

  const rows = toAlert.flatMap((application) =>
    (admins ?? [])
      .filter(
        (admin) =>
          admin.role === "super_admin" ||
          admin.role === "hr_officer" ||
          (admin.role === "branch_manager" && admin.branch_id === application.branch_id)
      )
      .map((admin) => ({
        admin_id: admin.id,
        type: "FINAL_PAY_OVERDUE",
        title: "Final pay is overdue",
        message: `A resigned employee's last working day was ${
          application.actual_last_day ?? application.last_working_day
        }. Final pay is past the 30-day legal deadline.`,
        application_id: application.id,
      }))
  );

  if (rows.length > 0) {
    await supabase.from("admin_alerts").insert(rows);
  }
}

/**
 * Admin alert, once per application, once any of a Hired applicant's pre-employment
 * documents passes its follow-up deadline (ADMIN_MAJOR_PLAN.md §T — per-item ranges,
 * not a single statute: SSS/PhilHealth/Pag-IBIG 30 days, TIN 10 days, the rest 7 days,
 * counted from when the checklist row was created). Re-alerts only if a fresh overdue
 * item appears after the application's one existing alert is cleared — the same
 * "once per application" simplification the other two reminders use.
 */
async function remindRequirementsOverdue(
  supabase: ReturnType<typeof createAdminClient>,
  applications: { id: string; status: string | null; branch_id: string | null }[]
) {
  const hiredIds = applications
    .filter((application) => normalizeStatus(application.status) === "Hired")
    .map((application) => application.id);
  if (hiredIds.length === 0) return;

  const { data: requirementRows } = await supabase
    .from("pre_employment_requirements")
    .select("application_id, requirement_name, created_at")
    .in("application_id", hiredIds)
    .neq("status", "Verified");
  if (!requirementRows || requirementRows.length === 0) return;

  const now = Date.now();
  const overdueByApplication = new Map<string, string[]>();
  for (const row of requirementRows) {
    const dueDays = REQUIREMENT_DUE_DAYS[row.requirement_name];
    if (!dueDays) continue;
    const dueAt = new Date(row.created_at).getTime() + dueDays * 24 * 60 * 60 * 1000;
    if (now <= dueAt) continue;
    const names = overdueByApplication.get(row.application_id) ?? [];
    names.push(row.requirement_name);
    overdueByApplication.set(row.application_id, names);
  }
  if (overdueByApplication.size === 0) return;

  const overdueAppIds = [...overdueByApplication.keys()];

  const { data: existingAlerts } = await supabase
    .from("admin_alerts")
    .select("application_id")
    .eq("type", "REQUIREMENT_OVERDUE")
    .in("application_id", overdueAppIds);
  const alreadyAlerted = new Set((existingAlerts ?? []).map((row) => row.application_id));

  const toAlert = overdueAppIds.filter((id) => !alreadyAlerted.has(id));
  if (toAlert.length === 0) return;

  const { data: admins } = await supabase
    .from("admin_users")
    .select("id, role, branch_id")
    .eq("is_active", true);

  const rows = toAlert.flatMap((applicationId) => {
    const application = applications.find((item) => item.id === applicationId);
    const names = overdueByApplication.get(applicationId) ?? [];
    return (admins ?? [])
      .filter(
        (admin) =>
          admin.role === "super_admin" ||
          admin.role === "hr_officer" ||
          (admin.role === "branch_manager" && admin.branch_id === application?.branch_id)
      )
      .map((admin) => ({
        admin_id: admin.id,
        type: "REQUIREMENT_OVERDUE",
        title: "Pre-employment document overdue",
        message: `${names.length} document${names.length === 1 ? "" : "s"} overdue for a hired applicant: ${names.join(", ")}.`,
        application_id: applicationId,
      }));
  });

  if (rows.length > 0) {
    await supabase.from("admin_alerts").insert(rows);
  }
}

export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, status, tags, markFinalPayReleased, actualLastDay } = body;

  if (!id) {
    return NextResponse.json({ error: "Application id is required." }, { status: 400 });
  }

  // Tag-only update (no status change) — used by the Notes & Tags panel.
  if (tags !== undefined && status === undefined) {
    const supabase = createAdminClient();
    const { error: tagError } = await supabase.from("applications").update({ tags }).eq("id", id);
    if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Confirms the real last day an employee reported for work, which can be
  // earlier than the planned last_working_day (incomplete notice period).
  if (actualLastDay && status === undefined) {
    const parsed = new Date(actualLastDay);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "The actual last day is not valid." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { error: dayError } = await supabase
      .from("applications")
      .update({ actual_last_day: parsed.toISOString().slice(0, 10) })
      .eq("id", id);
    if (dayError) return NextResponse.json({ error: dayError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Marks a resigned employee's final pay as released — clears the overdue alert's cause.
  if (markFinalPayReleased && status === undefined) {
    const supabase = createAdminClient();
    const { error: payError } = await supabase
      .from("applications")
      .update({ final_pay_released_at: new Date().toISOString() })
      .eq("id", id);
    if (payError) return NextResponse.json({ error: payError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!status) {
    return NextResponse.json({ error: "Application id and status are required." }, { status: 400 });
  }

  if (!isKnownStatus(status)) {
    return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 });
  }

  const next = normalizeStatus(status);

  if (next === "Interview Scheduled") {
    return NextResponse.json(
      { error: "Use Schedule interview to set this step, so the date and venue are saved." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: existing, error: fetchError } = await supabase
    .from("applications")
    .select("id, user_id, job_id, status, branch_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found." }, { status: 404 });
  }

  if (session.role === "branch_manager" && existing.branch_id !== session.branchId) {
    return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
  }

  const statusChanged = normalizeStatus(existing.status) !== next;

  // Hiring a Contractual applicant whose job has a duration starts the contract clock.
  const contractDates: { contract_start_date?: string; contract_end_date?: string } = {};
  if (statusChanged && next === "Hired") {
    const { data: job } = await supabase
      .from("jobs")
      .select("contract_duration_months")
      .eq("id", existing.job_id)
      .maybeSingle();

    if (job?.contract_duration_months) {
      const start = new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + job.contract_duration_months);
      contractDates.contract_start_date = start.toISOString().slice(0, 10);
      contractDates.contract_end_date = end.toISOString().slice(0, 10);
    }
  }

  const { error: updateError } = await supabase
    .from("applications")
    .update({ status: next, updated_at: new Date().toISOString(), ...contractDates })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (statusChanged) {
    await supabase.from("application_events").insert({
      application_id: id,
      actor_id: session.id,
      type: "status",
      detail: `${existing.status ?? "Pending"} → ${next}`,
    });
  }

  const warnings: string[] = [];
  let emailResult: EmailResult | null = null;

  if (statusChanged && existing.user_id) {
    const [{ data: job }, { data: applicant }] = await Promise.all([
      supabase.from("jobs").select("title").eq("id", existing.job_id).maybeSingle(),
      supabase.from("profiles").select("email, full_name").eq("user_id", existing.user_id).maybeSingle(),
    ]);
    const firstName = (applicant?.full_name ?? "").trim().split(/\s+/)[0];
    const content = statusContent(next, job?.title ?? null, firstName);

    // 1) The applicant's notification (bell, phone tray).
    const statusAlert = applicationStatusAlert(existing.user_id, existing.job_id, job?.title ?? null, next, existing.id);
    if (statusAlert) await insertAlerts(supabase, [statusAlert]);

    // 2) Hired: create the pre-employment document checklist.
    if (next === "Hired") {
      const { error: checklistError } = await supabase.from("pre_employment_requirements").upsert(
        PRE_EMPLOYMENT_REQUIREMENTS.map((name) => ({
          user_id: existing.user_id,
          application_id: existing.id,
          requirement_name: name,
        })),
        { onConflict: "application_id,requirement_name", ignoreDuplicates: true }
      );
      if (checklistError) warnings.push(`The document checklist could not be created: ${checklistError.message}`);
    }

    // 3) The longer HR note in the applicant's messages (not for Pending, which is just the starting point).
    if (next !== "Pending") {
      const { error: messageError } = await supabase.from("messages").insert({
        sender_id: session.id,
        receiver_id: existing.user_id,
        job_id: existing.job_id,
        body: content.note,
        is_read: false,
      });
      if (messageError) warnings.push(`The message could not be sent: ${messageError.message}`);

      // 4) The same note by email.
      emailResult = await sendApplicantEmail(supabase, {
        userId: existing.user_id,
        applicationId: existing.id,
        to: applicant?.email,
        subject: job?.title ? `${content.title}: ${job.title}` : content.title,
        heading: content.title,
        body: content.note,
        kind: emailKindFor(next),
        jobTitle: job?.title ?? null,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    status: next,
    email: emailResult,
    ...(warnings.length > 0 ? { warning: `Status updated, but: ${warnings.join(" ")}` } : {}),
  });
}

function emailKindFor(status: ReturnType<typeof normalizeStatus>): EmailKind {
  switch (status) {
    case "Reviewed":
      return "reviewed";
    case "Shortlisted":
      return "shortlisted";
    case "Interview Scheduled":
      return "interview";
    case "Hired":
      return "hired";
    case "Rejected":
      return "rejected";
    case "On Hold":
      return "on_hold";
    default:
      return "pending";
  }
}
