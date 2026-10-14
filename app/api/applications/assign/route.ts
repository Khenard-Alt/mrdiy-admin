import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";

type Action = "claim" | "assign" | "return" | "escalate";
const ACTIONS: Action[] = ["claim", "assign", "return", "escalate"];

export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, action, targetAdminId, note } = body as {
    id?: string;
    action?: Action;
    targetAdminId?: string;
    note?: string;
  };

  if (!id || !action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Application id and a valid action are required." }, { status: 400 });
  }

  if ((action === "assign" || action === "escalate") && !targetAdminId) {
    return NextResponse.json({ error: "A target admin is required for this action." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: application, error: fetchError } = await supabase
    .from("applications")
    .select("id, user_id, job_id, assigned_to, branch_id, transfer_status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found." }, { status: 404 });
  }

  if (session.role === "branch_manager" && application.branch_id !== session.branchId) {
    return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
  }

  if (action === "claim") {
    if (application.assigned_to && application.assigned_to !== session.id) {
      const { data: holder } = await supabase
        .from("admin_users")
        .select("full_name, username")
        .eq("id", application.assigned_to)
        .maybeSingle();
      return NextResponse.json(
        { error: `Already being handled by ${holder?.full_name || holder?.username || "another admin"}.` },
        { status: 409 }
      );
    }

    // Optimistic concurrency: claim only succeeds if nobody grabbed it in the meantime
    // (the PostgREST "is" filter only accepts null/true/false, so branch on that).
    let updateQuery = supabase.from("applications").update({ assigned_to: session.id }).eq("id", id);
    updateQuery =
      application.assigned_to === null
        ? updateQuery.is("assigned_to", null)
        : updateQuery.eq("assigned_to", application.assigned_to);
    const { data: updated, error: updateError } = await updateQuery.select("id");

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if ((updated ?? []).length === 0) {
      return NextResponse.json(
        { error: "Someone else just claimed this application. Refresh and try again." },
        { status: 409 }
      );
    }

    await supabase.from("application_events").insert({
      application_id: id,
      actor_id: session.id,
      type: "claim",
      detail: note?.trim() || null,
    });

    return NextResponse.json({ ok: true, assignedTo: session.id });
  }

  if (action === "return") {
    const { error: updateError } = await supabase.from("applications").update({ assigned_to: null }).eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await supabase.from("application_events").insert({
      application_id: id,
      actor_id: session.id,
      type: "return",
      detail: note?.trim() || null,
    });

    return NextResponse.json({ ok: true, assignedTo: null });
  }

  // assign / escalate
  const { data: target } = await supabase
    .from("admin_users")
    .select("id, full_name, username, branch_id")
    .eq("id", targetAdminId!)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Target admin not found." }, { status: 404 });
  }

  const crossBranch = target.branch_id !== null && target.branch_id !== application.branch_id;

  if (crossBranch) {
    // A real branch move: offer it to the applicant and wait for their consent,
    // same as how MR.DIY's real process has the applicant state/agree to a store.
    const { error: offerError } = await supabase
      .from("applications")
      .update({
        transfer_offer_branch_id: target.branch_id,
        transfer_offer_admin_id: target.id,
        transfer_status: "pending",
        transfer_responded_at: null,
      })
      .eq("id", id);

    if (offerError) return NextResponse.json({ error: offerError.message }, { status: 500 });

    await supabase.from("application_events").insert({
      application_id: id,
      actor_id: session.id,
      type: action,
      detail: `Offered transfer to ${target.full_name || target.username}'s branch.${note ? ` ${note.trim()}` : ""}`,
    });

    const { data: branch } = await supabase.from("branches").select("name").eq("id", target.branch_id).maybeSingle();

    if (branch?.name && application.user_id) {
      await insertAlerts(supabase, [
        {
          user_id: application.user_id,
          type: "APPLICATION_UPDATE",
          title: "Branch transfer offer",
          message: `MR.DIY ${branch.name} would like to consider your application. Open the app to accept or decline.`,
          job_id: application.job_id,
          application_id: id,
        },
      ]);
    }

    return NextResponse.json({ ok: true, assignedTo: application.assigned_to, transferPending: true });
  }

  // Same branch (or target has no branch, e.g. another HR officer/super admin) — reassign immediately.
  const { error: updateError } = await supabase.from("applications").update({ assigned_to: target.id }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("application_events").insert({
    application_id: id,
    actor_id: session.id,
    type: action,
    detail: note?.trim() || null,
  });

  if (target.id !== session.id) {
    const { data: actor } = await supabase
      .from("admin_users")
      .select("full_name, username")
      .eq("id", session.id)
      .maybeSingle();

    await supabase.from("admin_alerts").insert({
      admin_id: target.id,
      type: action === "escalate" ? "ESCALATION" : "HANDOFF",
      title: action === "escalate" ? "Application escalated to you" : "Application assigned to you",
      message: `${actor?.full_name || actor?.username || "An admin"} ${action === "escalate" ? "escalated" : "assigned"} an application to you.`,
      application_id: id,
    });
  }

  return NextResponse.json({ ok: true, assignedTo: target.id });
}
