import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";

/** The pre-employment documents of one application, with a short-lived link to each uploaded file. */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pre_employment_requirements")
    .select("id, requirement_name, status, document_url, remarks, created_at, updated_at, ai_review")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requirements = await Promise.all(
    (data ?? []).map(async (row) => {
      if (!row.document_url) return { ...row, fileUrl: null };
      const { data: signed } = await supabase.storage
        .from("requirements")
        .createSignedUrl(row.document_url, 60 * 60);
      return { ...row, fileUrl: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ requirements });
}

/** HR verifies a document, or sends it back with a reason. The applicant is notified either way. */
export async function PATCH(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action, remarks } = (await request.json()) as {
    id?: string;
    action?: "verify" | "reject";
    remarks?: string;
  };

  if (!id || (action !== "verify" && action !== "reject")) {
    return NextResponse.json({ error: "Requirement id and a valid action are required." }, { status: 400 });
  }
  if (action === "reject" && !(remarks ?? "").trim()) {
    return NextResponse.json({ error: "Please tell the applicant what is wrong with the document." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("pre_employment_requirements")
    .select("id, user_id, application_id, requirement_name, status, document_url")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Requirement not found." }, { status: 404 });
  }
  if (!row.document_url) {
    return NextResponse.json({ error: "The applicant has not uploaded this document yet." }, { status: 400 });
  }

  const nextStatus = action === "verify" ? "Verified" : "Rejected";
  const { error } = await supabase
    .from("pre_employment_requirements")
    .update({
      status: nextStatus,
      remarks: action === "reject" ? (remarks ?? "").trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: all } = await supabase
    .from("pre_employment_requirements")
    .select("status")
    .eq("application_id", row.application_id);
  const allVerified = (all ?? []).length > 0 && (all ?? []).every((item) => item.status === "Verified");

  await insertAlerts(supabase, [
    action === "verify"
      ? {
          user_id: row.user_id,
          type: "APPLICATION_UPDATE",
          title: allVerified ? "All documents verified" : "Document verified",
          message: allVerified
            ? "All your pre-employment documents are verified. We will contact you about your start date."
            : `Your ${row.requirement_name} was verified.`,
          application_id: row.application_id,
        }
      : {
          user_id: row.user_id,
          type: "APPLICATION_UPDATE",
          title: "Document needs attention",
          message: `Your ${row.requirement_name} was returned: ${(remarks ?? "").trim()} Please upload it again.`,
          application_id: row.application_id,
        },
  ]);

  return NextResponse.json({ ok: true, status: nextStatus, allVerified });
}
