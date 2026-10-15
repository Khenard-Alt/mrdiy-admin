import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { analyzeDocument } from "@/lib/documentVerification";

/** Magic-byte sniffing, same approach as lib/resumeText.ts's detectKind. */
function detectMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf"; // %PDF
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"; // \x89PNG
  return "application/octet-stream";
}

/**
 * On-demand AI assist (§6.2) for one profile document — HR triggers this themselves,
 * it never runs automatically on upload. Advisory only: writes a verdict into
 * ai_review but never changes `status`; Verify/Send-back stays a manual decision
 * via the existing PATCH handler in ../route.ts.
 */
export async function POST(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = (await request.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "Document id is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("applicant_documents")
    .select("id, user_id, document_name, document_url")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (!row.document_url) {
    return NextResponse.json({ error: "The applicant has not uploaded this document yet." }, { status: 400 });
  }

  const [{ data: file, error: downloadError }, { data: profile }] = await Promise.all([
    supabase.storage.from("applicant-documents").download(row.document_url),
    supabase.from("profiles").select("full_name").eq("user_id", row.user_id).maybeSingle(),
  ]);

  if (downloadError || !file) {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 500 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await analyzeDocument({
    documentName: row.document_name,
    applicantName: profile?.full_name ?? "the applicant",
    fileBytes: Buffer.from(bytes),
    mimeType: detectMimeType(bytes),
  });

  const aiReview = { result, checkedAt: new Date().toISOString() };
  await supabase.from("applicant_documents").update({ ai_review: aiReview }).eq("id", id);

  return NextResponse.json({ ok: true, ...aiReview });
}
