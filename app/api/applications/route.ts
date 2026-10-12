import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { applicationStatusAlert, insertAlerts } from "@/lib/notifications";
import {
  isKnownStatus,
  normalizeStatus,
  PRE_EMPLOYMENT_REQUIREMENTS,
  statusContent,
} from "@/lib/pipeline";
import { sendApplicantEmail, type EmailKind, type EmailResult } from "@/lib/email";

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("applications")
    .select(
      "id, user_id, job_id, resume_url, status, match_score, created_at, updated_at, assigned_to, branch_id, tags, transfer_status, transfer_offer_branch_id, contract_start_date, contract_end_date"
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

  const signedUrlMap = new Map<string, string>();

  if (resumePaths.length > 0) {
    const { data: signedUrls } = await supabase.storage
      .from("resumes")
      .createSignedUrls(resumePaths, 60 * 60);

    (signedUrls ?? []).forEach((entry) => {
      if (entry.signedUrl && entry.path) {
        signedUrlMap.set(entry.path, entry.signedUrl);
      }
    });
  }

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

export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, status, tags } = body;

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
    const statusAlert = applicationStatusAlert(existing.user_id, existing.job_id, job?.title ?? null, next);
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
