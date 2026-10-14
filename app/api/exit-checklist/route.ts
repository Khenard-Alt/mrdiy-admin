import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";

/** The exit checklist (company property returned) of one resigned application. */
export async function GET(request: NextRequest) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("exit_checklist")
    .select("id, item_name, status, remarks, updated_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

/** HR/branch manager marks an item returned/verified, or missing with a reason. */
export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action, remarks } = (await request.json()) as {
    id?: string;
    action?: "returned" | "verify" | "missing";
    remarks?: string;
  };

  if (!id || !action) {
    return NextResponse.json({ error: "Item id and a valid action are required." }, { status: 400 });
  }
  if (action === "missing" && !(remarks ?? "").trim()) {
    return NextResponse.json({ error: "Please note why this item is missing." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("exit_checklist")
    .select("id, user_id, application_id, item_name, status")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
  }

  const nextStatus = action === "returned" ? "Returned" : action === "verify" ? "Verified" : "Missing";

  const { error } = await supabase
    .from("exit_checklist")
    .update({
      status: nextStatus,
      remarks: action === "missing" ? (remarks ?? "").trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: all } = await supabase
    .from("exit_checklist")
    .select("status")
    .eq("application_id", row.application_id);
  const allCleared = (all ?? []).length > 0 && (all ?? []).every((item) => item.status === "Verified");

  if (allCleared) {
    await supabase
      .from("applications")
      .update({ clearance_completed_at: new Date().toISOString() })
      .eq("id", row.application_id)
      .is("clearance_completed_at", null);

    await insertAlerts(supabase, [
      {
        user_id: row.user_id,
        type: "APPLICATION_UPDATE",
        title: "Clearance complete",
        message: "Your exit clearance is complete. We will release your final pay within the required period.",
        application_id: row.application_id,
      },
    ]);
  }

  return NextResponse.json({ ok: true, status: nextStatus, allCleared });
}
