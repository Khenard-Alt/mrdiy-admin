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
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: applicationData, error: applicationError } = await supabase
    .from("applications")
    .select("id, user_id, job_id, resume_url, status, match_score, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 500 });
  }

  const applicationRows = applicationData ?? [];

  if (applicationRows.length === 0) {
    return NextResponse.json({ applications: [] });
  }

  const profileIds = [...new Set(applicationRows.map((item) => item.user_id).filter(Boolean))];
  const jobIds = [...new Set(applicationRows.map((item) => item.job_id).filter(Boolean))];

  const [profilesResult, jobsResult] = await Promise.all([
    profileIds.length > 0
      ? supabase
          .from("profiles")
          .select("id:user_id, full_name, email, phone, location, resume_url, resume_name, resume_uploaded_at")
          .in("user_id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title, location, salary").in("id", jobIds)
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
    };
  });

  return NextResponse.json({ applications: combined });
}

export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, status } = body;

  if (!id || !status) {
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
    .select("id, user_id, job_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found." }, { status: 404 });
  }

  const statusChanged = normalizeStatus(existing.status) !== next;

  const { error: updateError } = await supabase
    .from("applications")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
