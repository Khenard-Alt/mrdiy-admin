import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { buildBiodataPdf } from "@/lib/biodata";
import { statusLabel } from "@/lib/pipeline";

type WorkItem = {
  role?: string;
  company?: string;
  startYear?: string;
  endYear?: string;
  isCurrent?: boolean;
  description?: string;
};

type EducationItem = { degree?: string; school?: string; year?: string };

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Downloads the applicant's formatted biodata as a PDF. */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applicationId = new URL(request.url).searchParams.get("id");
  if (!applicationId) {
    return NextResponse.json({ error: "Application id is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, user_id, job_id, status, match_score, created_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const [{ data: profile }, { data: job }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", application.user_id).maybeSingle(),
    supabase.from("jobs").select("title, location").eq("id", application.job_id).maybeSingle(),
  ]);

  // The profile picture is stored as JPEG; leave the photo box empty if it is missing.
  let photo: Uint8Array | null = null;
  if (profile?.photo_path) {
    const { data: file } = await supabase.storage.from("avatars").download(profile.photo_path);
    if (file) photo = new Uint8Array(await file.arrayBuffer());
  }

  const experience = asArray<WorkItem>(profile?.work_experiences).map((item) => ({
    role: item.role ?? "",
    company: item.company ?? "",
    period: [item.startYear, item.isCurrent ? "Present" : item.endYear].filter(Boolean).join(" - "),
    description: item.description ?? "",
  }));

  const education = asArray<EducationItem>(profile?.education).map((item) => ({
    degree: item.degree ?? "",
    school: item.school ?? "",
    year: item.year ?? "",
  }));

  const bytes = await buildBiodataPdf({
    fullName: profile?.full_name ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    address: profile?.location ?? "",
    desiredPosition: profile?.desired_position ?? "",
    yearsExperience: profile?.years_experience ? `${profile.years_experience} year(s)` : "",
    headline: profile?.headline ?? "",
    about: profile?.about ?? "",
    skills: (profile?.skills ?? "")
      .split(",")
      .map((skill: string) => skill.trim())
      .filter(Boolean),
    education,
    experience,
    photo,
    application: {
      jobTitle: job?.title ?? "",
      jobLocation: job?.location ?? "",
      appliedOn: application.created_at
        ? new Date(application.created_at).toLocaleDateString("en-PH", {
            timeZone: "Asia/Manila",
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "",
      status: statusLabel(application.status),
      matchScore: application.match_score,
      resumeName: profile?.resume_name ?? (profile?.resume_url ? "Uploaded" : ""),
    },
  });

  const safeName = (profile?.full_name ?? "applicant").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Biodata_${safeName || "applicant"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
