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

  const { data: events, error } = await supabase
    .from("application_events")
    .select("id, actor_id, type, detail, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))];
  let actors: { id: string; full_name: string | null; username: string }[] = [];

  if (actorIds.length > 0) {
    const { data } = await supabase.from("admin_users").select("id, full_name, username").in("id", actorIds);
    actors = data ?? [];
  }

  const combined = (events ?? []).map((event) => ({
    ...event,
    actor: actors.find((a) => a.id === event.actor_id) ?? null,
  }));

  return NextResponse.json({ events: combined });
}
