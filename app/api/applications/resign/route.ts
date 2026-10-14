import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";
import { EXIT_CHECKLIST_ITEMS, normalizeStatus, statusContent } from "@/lib/pipeline";
import { sendApplicantEmail } from "@/lib/email";

/**
 * Records a voluntary resignation: sets status to Resigned, computes the default
 * last working day (resignation_date + 30 days, the Labor Code Article 300 default
 * notice — HR/branch manager can edit it if a shorter notice was accepted), and
 * creates the exit checklist (ADMIN_MAJOR_PLAN.md §Q).
 */
export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { applicationId, resignationDate, lastWorkingDay } = body as {
    applicationId?: string;
    resignationDate?: string;
    lastWorkingDay?: string;
  };

  if (!applicationId || !resignationDate) {
    return NextResponse.json({ error: "Application id and resignation date are required." }, { status: 400 });
  }

  const resignedOn = new Date(resignationDate);
  if (Number.isNaN(resignedOn.getTime())) {
    return NextResponse.json({ error: "The resignation date is not valid." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: application, error: fetchError } = await supabase
    .from("applications")
    .select("id, user_id, job_id, status, branch_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found." }, { status: 404 });
  }

  if (session.role === "branch_manager" && application.branch_id !== session.branchId) {
    return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
  }

  if (normalizeStatus(application.status) !== "Hired") {
    return NextResponse.json({ error: "Only a Hired applicant can resign." }, { status: 400 });
  }

  // Default notice period: 30 calendar days (Labor Code Art. 300). A shorter
  // last working day is allowed only because the employer may accept/waive it.
  let effectiveLastDay: Date;
  if (lastWorkingDay) {
    effectiveLastDay = new Date(lastWorkingDay);
    if (Number.isNaN(effectiveLastDay.getTime())) {
      return NextResponse.json({ error: "The last working day is not valid." }, { status: 400 });
    }
  } else {
    effectiveLastDay = new Date(resignedOn);
    effectiveLastDay.setDate(effectiveLastDay.getDate() + 30);
  }

  const { error: updateError } = await supabase
    .from("applications")
    .update({
      status: "Resigned",
      resignation_date: resignedOn.toISOString().slice(0, 10),
      last_working_day: effectiveLastDay.toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("application_events").insert({
    application_id: applicationId,
    actor_id: session.id,
    type: "status",
    detail: `Resignation recorded. Last working day: ${effectiveLastDay.toISOString().slice(0, 10)}.`,
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

  // Notify the applicant, same pattern as every other status change.
  let emailResult = null;
  if (application.user_id) {
    const [{ data: job }, { data: applicant }] = await Promise.all([
      supabase.from("jobs").select("title").eq("id", application.job_id).maybeSingle(),
      supabase.from("profiles").select("email, full_name").eq("user_id", application.user_id).maybeSingle(),
    ]);
    const firstName = (applicant?.full_name ?? "").trim().split(/\s+/)[0];
    const content = statusContent("Resigned", job?.title ?? null, firstName);

    await insertAlerts(supabase, [
      {
        user_id: application.user_id,
        type: "APPLICATION_UPDATE",
        job_id: application.job_id,
        application_id: applicationId,
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
    lastWorkingDay: effectiveLastDay.toISOString().slice(0, 10),
    email: emailResult,
    ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
  });
}
