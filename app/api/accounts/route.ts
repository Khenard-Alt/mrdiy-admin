import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { hasRole, type AdminRole } from "@/lib/adminSession";

const VALID_ROLES: AdminRole[] = ["super_admin", "hr_officer", "branch_manager"];

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!hasRole(session, "super_admin")) {
    return NextResponse.json({ error: "Only a super admin can manage accounts." }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, username, email, full_name, role, branch_id, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!hasRole(session, "super_admin")) {
    return NextResponse.json({ error: "Only a super admin can create accounts." }, { status: 403 });
  }

  const body = await request.json();
  const { username, password, fullName, email, role, branchId } = body;

  if (!username?.trim() || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  if (role === "branch_manager" && !branchId) {
    return NextResponse.json({ error: "A branch manager must be assigned a branch." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .insert({
      username: username.trim(),
      password,
      email: email?.trim() || null,
      full_name: fullName?.trim() || "HR Administrator",
      role,
      branch_id: branchId || null,
    })
    .select("id, username, email, full_name, role, branch_id, is_active, created_at")
    .single();

  if (error) {
    const message = error.code === "23505" ? "That username is already taken." : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!hasRole(session, "super_admin")) {
    return NextResponse.json({ error: "Only a super admin can update accounts." }, { status: 403 });
  }

  const body = await request.json();
  const { id, password, fullName, email, role, branchId, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: "Account id is required." }, { status: 400 });
  }

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  if (id === session!.id && isActive === false) {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (password) update.password = password;
  if (fullName !== undefined) update.full_name = fullName?.trim() || "HR Administrator";
  if (email !== undefined) update.email = email?.trim() || null;
  if (role !== undefined) update.role = role;
  if (branchId !== undefined) update.branch_id = branchId || null;
  if (isActive !== undefined) update.is_active = isActive;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .update(update)
    .eq("id", id)
    .select("id, username, email, full_name, role, branch_id, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}
