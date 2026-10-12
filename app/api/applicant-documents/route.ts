import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";
import { PROFILE_DOCUMENTS } from "@/lib/pipeline";

/**
 * An applicant's profile-level documents (Valid ID + the pre-employment document
 * types), optional and uploadable any time — not tied to one application. Every
 * expected document type is returned even if the applicant hasn't uploaded it yet,
 * so HR always sees the full checklist and what's still missing.
 */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("applicant_documents")
    .select("id, document_name, status, document_url, remarks, updated_at")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byName = new Map((data ?? []).map((row) => [row.document_name, row]));

  const documents = await Promise.all(
    PROFILE_DOCUMENTS.map(async (name) => {
      const row = byName.get(name);
      if (!row) {
        return {
          id: null,
          document_name: name,
          status: "Pending" as const,
          document_url: null,
          remarks: null,
          fileUrl: null,
          updated_at: null,
        };
      }
      if (!row.document_url) return { ...row, fileUrl: null };
      const { data: signed } = await supabase.storage
        .from("applicant-documents")
        .createSignedUrl(row.document_url, 60 * 60);
      return { ...row, fileUrl: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents });
}

/** HR verifies a profile document, or sends it back with a reason. The applicant is notified either way. */
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
    return NextResponse.json({ error: "Document id and a valid action are required." }, { status: 400 });
  }
  if (action === "reject" && !(remarks ?? "").trim()) {
    return NextResponse.json({ error: "Please tell the applicant what is wrong with the document." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("applicant_documents")
    .select("id, user_id, document_name, status, document_url")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (!row.document_url) {
    return NextResponse.json({ error: "The applicant has not uploaded this document yet." }, { status: 400 });
  }

  const nextStatus = action === "verify" ? "Verified" : "Rejected";
  const { error } = await supabase
    .from("applicant_documents")
    .update({
      status: nextStatus,
      remarks: action === "reject" ? (remarks ?? "").trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await insertAlerts(supabase, [
    action === "verify"
      ? {
          user_id: row.user_id,
          type: "APPLICATION_UPDATE",
          title: "Document verified",
          message: `Your ${row.document_name} was verified.`,
        }
      : {
          user_id: row.user_id,
          type: "APPLICATION_UPDATE",
          title: "Document needs attention",
          message: `Your ${row.document_name} was returned: ${(remarks ?? "").trim()} Please upload it again.`,
        },
  ]);

  return NextResponse.json({ ok: true, status: nextStatus });
}
