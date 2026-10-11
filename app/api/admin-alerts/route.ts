import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_alerts")
    .select("id, type, title, message, application_id, is_read, created_at")
    .eq("admin_id", session.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { ids, markAll } = body as { ids?: string[]; markAll?: boolean };

  const supabase = createAdminClient();

  if (markAll) {
    const { error } = await supabase
      .from("admin_alerts")
      .update({ is_read: true })
      .eq("admin_id", session.id)
      .eq("is_read", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: "ids or markAll is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("admin_alerts")
    .update({ is_read: true })
    .eq("admin_id", session.id)
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
