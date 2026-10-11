import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionCookie, COOKIE_NAME, type AdminRole } from "@/lib/adminSession";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("id, username, password, full_name, role, branch_id, is_active")
    .eq("username", username.trim())
    .maybeSingle();

  if (error || !admin || admin.password !== password) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  if (admin.is_active === false) {
    return NextResponse.json({ error: "This account has been disabled." }, { status: 403 });
  }

  const role = (admin.role ?? "hr_officer") as AdminRole;

  const cookieValue = createSessionCookie({
    id: admin.id,
    username: admin.username,
    fullName: admin.full_name ?? "HR Administrator",
    role,
    branchId: admin.branch_id ?? null,
  });

  const response = NextResponse.json({
    id: admin.id,
    username: admin.username,
    fullName: admin.full_name,
    role,
    branchId: admin.branch_id ?? null,
  });

  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
