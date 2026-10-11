import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (session.role === "branch_manager") {
    const { data: application } = await supabase
      .from("applications")
      .select("branch_id")
      .eq("id", applicationId)
      .maybeSingle();
    if (!application || application.branch_id !== session.branchId) {
      return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
    }
  }

  const { data: notes, error } = await supabase
    .from("application_notes")
    .select("id, author_id, body, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const authorIds = [...new Set((notes ?? []).map((n) => n.author_id).filter(Boolean))];
  let authors: { id: string; full_name: string | null; username: string }[] = [];
  if (authorIds.length > 0) {
    const { data } = await supabase.from("admin_users").select("id, full_name, username").in("id", authorIds);
    authors = data ?? [];
  }

  const combined = (notes ?? []).map((note) => ({
    ...note,
    author: authors.find((a) => a.id === note.author_id) ?? null,
  }));

  return NextResponse.json({ notes: combined });
}

export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { applicationId, text } = body as { applicationId?: string; text?: string };

  if (!applicationId || !text?.trim()) {
    return NextResponse.json({ error: "applicationId and text are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (session.role === "branch_manager") {
    const { data: application } = await supabase
      .from("applications")
      .select("branch_id")
      .eq("id", applicationId)
      .maybeSingle();
    if (!application || application.branch_id !== session.branchId) {
      return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("application_notes")
    .insert({ application_id: applicationId, author_id: session.id, body: text.trim() })
    .select("id, author_id, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("application_events").insert({
    application_id: applicationId,
    actor_id: session.id,
    type: "note",
    detail: text.trim().slice(0, 80),
  });

  return NextResponse.json({ note: { ...data, author: { id: session.id, full_name: session.fullName, username: session.username } } });
}
