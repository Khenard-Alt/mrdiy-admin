import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionCookie, COOKIE_NAME } from "@/lib/adminSession";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("id, username, password, full_name, role")
    .eq("username", username.trim())
    .maybeSingle();

  if (error || !admin || admin.password !== password) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const cookieValue = createSessionCookie({
    id: admin.id,
    username: admin.username,
    fullName: admin.full_name ?? "HR Administrator",
    role: admin.role ?? "admin",
  });

  const response = NextResponse.json({
    id: admin.id,
    username: admin.username,
    fullName: admin.full_name,
    role: admin.role,
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
