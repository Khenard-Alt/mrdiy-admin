import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";
import { EXIT_CHECKLIST_ITEMS, normalizeStatus, statusContent } from "@/lib/pipeline";
import { sendApplicantEmail } from "@/lib/email";

/**
 * The AWOL/abandonment twin-notice process (ADMIN_MAJOR_PLAN.md §Q —
 * Aliten v. U-Need Lumber, G.R. 168931, 2006): abandonment is never automatic.
 * Each action here is one step of that process, not an instant status change.
 */
export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { applicationId, action } = body as {
    applicationId?: string;
    action?: "notice1" | "explanation" | "reinstate" | "terminate";
  };

  if (!applicationId || !action) {
    return NextResponse.json({ error: "Application id and a valid action are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: application, error: fetchError } = await supabase
    .from("applications")
    .select(
      "id, user_id, job_id, status, branch_id, awol_notice1_sent_at, awol_explanation_deadline"
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found." }, { status: 404 });
  }

  if (session.role === "branch_manager" && application.branch_id !== session.branchId) {
    return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
  }

  // ── Step 1: return-to-work notice ──────────────────────────────────────
  if (action === "notice1") {
    const { absenceSince, explanationDeadline } = body as { absenceSince?: string; explanationDeadline?: string };
    if (!absenceSince) {
      return NextResponse.json({ error: "The first unexplained absence date is required." }, { status: 400 });
    }
    if (normalizeStatus(application.status) !== "Hired") {
      return NextResponse.json({ error: "Only a currently Hired employee can be sent a return-to-work notice." }, { status: 400 });
    }

    const deadline = explanationDeadline
      ? new Date(explanationDeadline)
      : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 calendar days, a common reasonable period

    const { error: updateError } = await supabase
      .from("applications")
      .update({
        awol_absence_since: absenceSince,
        awol_notice1_sent_at: new Date().toISOString(),
        awol_explanation_deadline: deadline.toISOString().slice(0, 10),
      })
      .eq("id", applicationId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await supabase.from("application_events").insert({
      application_id: applicationId,
      actor_id: session.id,
      type: "status",
      detail: `Return-to-work notice sent. Unexplained absence since ${absenceSince}. Explanation due ${deadline
        .toISOString()
        .slice(0, 10)}.`,
    });

    if (application.user_id) {
      await insertAlerts(supabase, [
        {
          user_id: application.user_id,
          type: "APPLICATION_UPDATE",
          job_id: application.job_id,
          title: "Return to work notice",
          message:
            "You have been absent without notice. Please contact MR.DIY Human Resources immediately to explain or return to work.",
        },
      ]);
    }

    return NextResponse.json({ ok: true, explanationDeadline: deadline.toISOString().slice(0, 10) });
  }

  // ── Step 2: explanation received (optional — may also simply go unanswered) ──
  if (action === "explanation") {
    const { explanationText } = body as { explanationText?: string };
    if (!application.awol_notice1_sent_at) {
      return NextResponse.json({ error: "Send the return-to-work notice first." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("applications")
      .update({
        awol_explanation_received_at: new Date().toISOString(),
        awol_explanation_text: (explanationText ?? "").trim() || null,
      })
      .eq("id", applicationId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await supabase.from("application_events").insert({
      application_id: applicationId,
      actor_id: session.id,
      type: "status",
      detail: "Explanation recorded.",
    });

    return NextResponse.json({ ok: true });
  }

  // ── Step 3a: not abandonment — clear the process, employee stays Hired ──
  if (action === "reinstate") {
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        awol_absence_since: null,
        awol_notice1_sent_at: null,
        awol_explanation_deadline: null,
        awol_explanation_received_at: null,
        awol_explanation_text: null,
      })
      .eq("id", applicationId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await supabase.from("application_events").insert({
      application_id: applicationId,
      actor_id: session.id,
      type: "status",
      detail: "AWOL process closed — not treated as abandonment. Employee reinstated.",
    });

    return NextResponse.json({ ok: true });
  }

  // ── Step 3b: termination notice — the only way "Terminated" gets set ────
  if (action === "terminate") {
    const { terminationReason, lastDayWorked } = body as { terminationReason?: string; lastDayWorked?: string };
    if (!(terminationReason ?? "").trim()) {
      return NextResponse.json({ error: "A termination reason is required." }, { status: 400 });
    }
    if (!application.awol_notice1_sent_at) {
      return NextResponse.json({ error: "Send the return-to-work notice before finalizing a termination." }, { status: 400 });
    }

    const reason = terminationReason!.trim();
    const terminatedAt = new Date();

    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "Terminated",
        termination_reason: reason,
        termination_finalized_at: terminatedAt.toISOString(),
        terminated_by: session.id,
        last_working_day: terminatedAt.toISOString().slice(0, 10),
        actual_last_day: lastDayWorked || null,
        updated_at: terminatedAt.toISOString(),
      })
      .eq("id", applicationId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await supabase.from("application_events").insert({
      application_id: applicationId,
      actor_id: session.id,
      type: "status",
      detail: `Termination notice sent. Reason: ${reason}`,
    });

    const { error: checklistError } = await supabase.from("exit_checklist").upsert(
      EXIT_CHECKLIST_ITEMS.map((name) => ({
        user_id: application.user_id,
        application_id: applicationId,
        item_name: name,
      })),
      { onConflict: "application_id,item_name", ignoreDuplicates: true }
    );

    const warnings: string[] = [];
    if (checklistError) warnings.push(`The exit checklist could not be created: ${checklistError.message}`);

    let emailResult = null;
    if (application.user_id) {
      const [{ data: job }, { data: applicant }] = await Promise.all([
        supabase.from("jobs").select("title").eq("id", application.job_id).maybeSingle(),
        supabase.from("profiles").select("email, full_name").eq("user_id", application.user_id).maybeSingle(),
      ]);
      const firstName = (applicant?.full_name ?? "").trim().split(/\s+/)[0];
      const content = statusContent("Terminated", job?.title ?? null, firstName);

      await insertAlerts(supabase, [
        {
          user_id: application.user_id,
          type: "APPLICATION_UPDATE",
          job_id: application.job_id,
          title: content.title,
          message: content.alert,
        },
      ]);

      await supabase.from("messages").insert({
        sender_id: session.id,
        receiver_id: application.user_id,
        job_id: application.job_id,
        body: content.note,
        is_read: false,
      });

      emailResult = await sendApplicantEmail(supabase, {
        userId: application.user_id,
        applicationId,
        to: applicant?.email,
        subject: job?.title ? `${content.title}: ${job.title}` : content.title,
        heading: content.title,
        body: content.note,
        kind: "info",
        jobTitle: job?.title ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      email: emailResult,
      ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
