import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { rankApplicants } from "@/lib/ranking";
import { estimateVelocity } from "@/lib/velocity";

/**
 * Everything HR needs to review one application: the applicant's picture, their resume (original
 * and scanned text), the match %, the matched words, strengths, weaknesses, the rank among all
 * applicants for the job with an explanation, how soon they could start, and the emails sent.
 */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applicationId = new URL(request.url).searchParams.get("id");
  if (!applicationId) {
    return NextResponse.json({ error: "Application id is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, user_id, job_id, resume_url, match_score, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return NextResponse.json(
      { error: applicationError?.message ?? "Application not found." },
      { status: applicationError ? 500 : 404 }
    );
  }

  const [{ data: profile }, { data: emails }, { data: requirements }, ranking] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", application.user_id).maybeSingle(),
    // Emails already sent to this applicant for this application (if the log table exists).
    supabase
      .from("notification_emails")
      .select("to_email, subject, status, error, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("pre_employment_requirements").select("status").eq("application_id", applicationId),
    rankApplicants(supabase, application.job_id),
  ]);

  const entry = ranking.applicants.find((item) => item.applicationId === applicationId) ?? null;

  // Profile picture (private bucket) -> short-lived signed URL.
  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.photo_path, 60 * 60);
    photoUrl = data?.signedUrl ?? null;
  }

  // Original resume file -> signed URL for viewing.
  const resumePath: string | null = application.resume_url || profile?.resume_url || null;
  let resumeUrl: string | null = null;
  if (resumePath && !resumePath.startsWith("http")) {
    const { data: signed } = await supabase.storage.from("resumes").createSignedUrl(resumePath, 60 * 60);
    resumeUrl = signed?.signedUrl ?? null;
  } else if (resumePath) {
    resumeUrl = resumePath;
  }

  const skills: string[] = (profile?.skills ?? "")
    .split(",")
    .map((skill: string) => skill.trim())
    .filter(Boolean);

  const profileComplete = Boolean(
    profile?.full_name && profile?.phone && profile?.location && profile?.desired_position && skills.length > 0 && resumePath
  );
  const documents = requirements ?? [];
  const velocity = estimateVelocity({
    matchScore: application.match_score ?? entry?.finalScore ?? null,
    profileComplete,
    documentsVerified: documents.filter((item) => item.status === "Verified").length,
    documentsTotal: documents.length,
  });

  return NextResponse.json({
    applicant: {
      name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
      desiredPosition: profile?.desired_position ?? null,
      skills,
    },
    job: ranking.job ? { title: ranking.job.title, location: ranking.job.location } : null,
    photoUrl,
    resumeUrl,
    resumeKind: entry?.resumeKind ?? null,
    resumeText: entry?.resumeText ?? "",
    resumeError: entry?.resumeError ?? null,
    emails: emails ?? [],
    matchScore: application.match_score,
    // The score as it would be computed today (the saved one is from the day they applied).
    currentScore: entry?.finalScore ?? null,
    textScore: entry?.textScore ?? 0,
    distanceKm: entry?.distanceKm ?? null,
    keywords: entry?.keywords ?? [],
    matchedSkills: entry?.matchedSkills ?? [],
    missingSkills: entry?.missingSkills ?? [],
    strengths: entry?.strengths ?? [],
    weaknesses: entry?.weaknesses ?? [],
    explanation: entry?.explanation ?? "",
    rank: entry?.rank ?? null,
    totalApplicants: entry?.total ?? null,
    velocity,
  });
}
