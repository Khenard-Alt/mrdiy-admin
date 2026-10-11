import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

/** Copies a job posting to another branch as a Draft, so HR doesn't retype it. */
export async function POST(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, branchId, location } = body as { id?: string; branchId?: string; location?: string };

  if (!id) {
    return NextResponse.json({ error: "Job id is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: original, error: fetchError } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();

  if (fetchError || !original) {
    return NextResponse.json({ error: fetchError?.message ?? "Job not found." }, { status: 404 });
  }

  const { id: _id, created_at: _createdAt, ...rest } = original;
  void _id;
  void _createdAt;

  const { data: created, error } = await supabase
    .from("jobs")
    .insert({
      ...rest,
      status: "draft",
      branch_id: branchId || null,
      location: location || original.location,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: created });
}
