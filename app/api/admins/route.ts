import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";

/**
 * Read-only, any-admin-accessible directory used for hand-off pickers
 * (assign/escalate). Unlike /api/accounts (super admin only, full CRUD),
 * this never exposes password or allows writes.
 */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, username, full_name, role, branch_id, branches!branch_id(name)")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admins = (data ?? []).map((admin) => {
    const branch = admin.branches as unknown as { name: string | null } | { name: string | null }[] | null;
    const branchName = Array.isArray(branch) ? (branch[0]?.name ?? null) : (branch?.name ?? null);
    return {
      id: admin.id,
      username: admin.username,
      full_name: admin.full_name,
      role: admin.role,
      branch_id: admin.branch_id,
      branch_name: branchName,
    };
  });

  return NextResponse.json({ admins });
}
