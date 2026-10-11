import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { analyzeMatch, buildJobDoc, buildProfileDoc } from "@/lib/matching";

type ResumeKind = "pdf" | "docx" | "text";

function detectKind(bytes: Uint8Array): ResumeKind {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head === "%PDF-") return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "docx";
  return "text";
}

async function extractResumeText(bytes: Uint8Array, kind: ResumeKind): Promise<string> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  if (kind === "docx") {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return "";
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  return new TextDecoder().decode(bytes);
}

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
    .select("id, user_id, job_id, resume_url, match_score")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return NextResponse.json(
      { error: applicationError?.message ?? "Application not found." },
      { status: applicationError ? 500 : 404 }
    );
  }

  const [{ data: profile }, { data: job }, { data: allJobs }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", application.user_id).maybeSingle(),
    supabase.from("jobs").select("*").eq("id", application.job_id).maybeSingle(),
    supabase.from("jobs").select("*").limit(1000),
  ]);

  // Emails already sent to this applicant for this application (if the log table exists).
  const { data: emails } = await supabase
    .from("notification_emails")
    .select("to_email, subject, status, error, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Profile picture (private bucket) -> short-lived signed URL.
  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage
      .from("avatars")
      .createSignedUrl(profile.photo_path, 60 * 60);
    photoUrl = data?.signedUrl ?? null;
  }

  // Resume file: download for text scanning, sign a URL for viewing the original.
  const resumePath: string | null = application.resume_url || profile?.resume_url || null;
  let resumeText = "";
  let resumeKind: ResumeKind | null = null;
  let resumeUrl: string | null = null;
  let resumeError: string | null = null;

  if (resumePath && !resumePath.startsWith("http")) {
    const { data: signed } = await supabase.storage
      .from("resumes")
      .createSignedUrl(resumePath, 60 * 60);
    resumeUrl = signed?.signedUrl ?? null;

    try {
      const { data: file, error: downloadError } = await supabase.storage
        .from("resumes")
        .download(resumePath);
      if (downloadError || !file) throw new Error(downloadError?.message ?? "Download failed");

      const bytes = new Uint8Array(await file.arrayBuffer());
      resumeKind = detectKind(bytes);
      resumeText = (await extractResumeText(bytes, resumeKind)).trim();
    } catch (error) {
      resumeError = error instanceof Error ? error.message : "Could not read the resume.";
    }
  } else if (resumePath) {
    resumeUrl = resumePath;
  }

  // Same inputs the app's matching uses: profile fields plus the resume text.
  const profileDoc = buildProfileDoc(profile, resumeText);

  const analysis = job
    ? analyzeMatch(
        profileDoc,
        buildJobDoc(job),
        (allJobs ?? []).map(buildJobDoc)
      )
    : { textScore: 0, keywords: [] };

  const skills: string[] = (profile?.skills ?? "")
    .split(",")
    .map((skill: string) => skill.trim())
    .filter(Boolean);
  const jobText = buildJobDoc(job ?? {}).toLowerCase();

  return NextResponse.json({
    applicant: {
      name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
      desiredPosition: profile?.desired_position ?? null,
      skills,
    },
    job: job ? { title: job.title, location: job.location } : null,
    photoUrl,
    resumeUrl,
    resumeKind,
    resumeText,
    resumeError,
    emails: emails ?? [],
    matchScore: application.match_score,
    textScore: analysis.textScore,
    keywords: analysis.keywords.slice(0, 40),
    matchedSkills: skills.filter((skill) => jobText.includes(skill.toLowerCase())),
  });
}
