import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { hasRole } from "@/lib/adminSession";

export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, location, manager_id")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ branches: data ?? [] });
}

export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!hasRole(session, "super_admin")) {
    return NextResponse.json({ error: "Only a super admin can create branches." }, { status: 403 });
  }

  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Branch name is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("branches")
    .insert({ name: body.name.trim(), location: body.location?.trim() || null })
    .select("id, name, location, manager_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ branch: data });
}
