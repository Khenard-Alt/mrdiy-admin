import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

const DATA_URL_PREFIX = "data:image/png;base64,";

/** The branch manager (or HR/super admin) countersigns a Contractual hire's employment contract. */
export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { applicationId, signature } = body as { applicationId?: string; signature?: string };

  if (!applicationId || !signature?.startsWith(DATA_URL_PREFIX)) {
    return NextResponse.json({ error: "Application id and a signature image are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: application, error: fetchError } = await supabase
    .from("applications")
    .select("id, job_id, status, branch_id, manager_signature_url")
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found." }, { status: 404 });
  }

  if (session.role === "branch_manager" && application.branch_id !== session.branchId) {
    return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
  }

  if (application.status !== "Hired") {
    return NextResponse.json({ error: "The contract can only be signed once the applicant is Hired." }, { status: 400 });
  }

  if (application.manager_signature_url) {
    return NextResponse.json({ error: "This contract is already signed." }, { status: 400 });
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("contract_duration_months")
    .eq("id", application.job_id)
    .maybeSingle();

  if (!job?.contract_duration_months) {
    return NextResponse.json({ error: "This job has no fixed contract term to sign for." }, { status: 400 });
  }

  const bytes = Buffer.from(signature.slice(DATA_URL_PREFIX.length), "base64");
  const path = `${applicationId}/signature-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("contract-signatures")
    .upload(path, bytes, { contentType: "image/png", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Could not save the signature: ${uploadError.message}` }, { status: 500 });
  }

  const signedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("applications")
    .update({
      manager_signature_url: path,
      manager_signed_at: signedAt,
      manager_signed_by: session.id,
    })
    .eq("id", applicationId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("application_events").insert({
    application_id: applicationId,
    actor_id: session.id,
    type: "status",
    detail: "Employment contract countersigned.",
  });

  return NextResponse.json({ ok: true, signedAt });
}

/** A short-lived link to view an already-signed contract's signature image. */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: application } = await supabase
    .from("applications")
    .select("manager_signature_url, manager_signed_at, manager_signed_by")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application?.manager_signature_url) {
    return NextResponse.json({ signed: false });
  }

  const { data: signed } = await supabase.storage
    .from("contract-signatures")
    .createSignedUrl(application.manager_signature_url, 60 * 60);

  const { data: signer } = application.manager_signed_by
    ? await supabase.from("admin_users").select("full_name, username").eq("id", application.manager_signed_by).maybeSingle()
    : { data: null };

  return NextResponse.json({
    signed: true,
    signatureUrl: signed?.signedUrl ?? null,
    signedAt: application.manager_signed_at,
    signedByName: signer?.full_name || signer?.username || null,
  });
}
