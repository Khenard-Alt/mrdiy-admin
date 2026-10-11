import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { rankApplicants } from "@/lib/ranking";

/** The applicants of one job ranked by match %, each with strengths, weaknesses and an explanation. */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const { job, applicants } = await rankApplicants(createAdminClient(), jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  // The scanned resume text is only needed in the review screen.
  return NextResponse.json({
    job,
    applicants: applicants.map((item) => ({ ...item, resumeText: undefined, keywords: undefined })),
  });
}
