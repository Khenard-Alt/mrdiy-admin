import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

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
          .select("id, full_name, email, phone, location, resume_url, resume_name, resume_uploaded_at")
          .in("id", profileIds)
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

  const supabase = createAdminClient();

  const { data: existing, error: fetchError } = await supabase
    .from("applications")
    .select("id, user_id, job_id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found." }, { status: 404 });
  }

  const statusChanged = (existing.status ?? "Pending").toLowerCase() !== status.toLowerCase();

  const { error: updateError } = await supabase
    .from("applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (statusChanged && existing.user_id) {
    let messageBody = "";

    if (status === "Reviewed") {
      messageBody =
        "Dear Applicant\n\nYour application has been reviewed by our recruitment team. " +
        "We will continue evaluating your application and will provide an update once a decision has been made.\n\n" +
        "Thank you for your interest in MR.DIY.";
    }

    if (status === "Approved") {
      messageBody =
        "Congratulations!\n\nYour application has been approved by our recruitment team. " +
        "Please check your messages for further instructions regarding the next steps.\n\n" +
        "Thank you for your interest in MR.DIY.";
    }

    if (status === "Rejected") {
      messageBody =
        "Dear Applicant\n\nThank you for your interest in MR.DIY. We appreciate the opportunity to consider your application.\n\n" +
        "After reviewing your application, we have decided to proceed with other candidates whose qualifications more closely match our current requirements.\n\n" +
        "We wish you the best in your future endeavors.";
    }

    if (messageBody) {
      const { error: messageError } = await supabase.from("messages").insert({
        sender_id: session.id,
        receiver_id: existing.user_id,
        job_id: existing.job_id,
        body: messageBody,
        is_read: false,
      });

      if (messageError) {
        return NextResponse.json(
          { ok: true, warning: `Status updated, but message could not be sent: ${messageError.message}` }
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
