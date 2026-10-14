import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";
import { sendApplicantEmail } from "@/lib/email";
import { normalizeStatus } from "@/lib/pipeline";

/** "Wednesday, October 14, 2026 at 2:00 PM" in Philippine time, for messages and emails. */
function whenText(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type InterviewRow = {
  id: string;
  application_id: string;
  user_id: string;
  job_id: string | null;
  scheduled_at: string;
  venue: string;
  mode: "in_person" | "online";
  meeting_link: string | null;
  notes: string | null;
  status: string;
  applicant_response: string;
};

function detailsText(interview: InterviewRow) {
  const where =
    interview.mode === "online"
      ? `Online${interview.meeting_link ? `: ${interview.meeting_link}` : ""}`
      : interview.venue;
  return `When: ${whenText(interview.scheduled_at)}\nWhere: ${where}${
    interview.notes ? `\nNotes: ${interview.notes}` : ""
  }`;
}

/** The interviews of one application, newest first. */
export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (session.role === "branch_manager") {
    const { data: application } = await supabase
      .from("applications")
      .select("branch_id")
      .eq("id", applicationId)
      .maybeSingle();
    if (application?.branch_id !== session.branchId) {
      return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ interviews: data ?? [] });
}

/** Schedules an interview, or reschedules the active one. Moves the application to Interview Scheduled. */
export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { applicationId, scheduledAt, venue, mode, meetingLink, notes } = body as {
    applicationId?: string;
    scheduledAt?: string;
    venue?: string;
    mode?: "in_person" | "online";
    meetingLink?: string;
    notes?: string;
  };

  if (!applicationId || !scheduledAt) {
    return NextResponse.json({ error: "Application and interview date are required." }, { status: 400 });
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "The interview date is not valid." }, { status: 400 });
  }
  if (when.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "The interview must be set in the future." }, { status: 400 });
  }

  const interviewMode = mode === "online" ? "online" : "in_person";
  const place = (venue ?? "").trim();
  const link = (meetingLink ?? "").trim();

  if (interviewMode === "in_person" && !place) {
    return NextResponse.json({ error: "Please enter the venue (branch or address)." }, { status: 400 });
  }
  if (interviewMode === "online" && !/^https?:\/\/\S+$/i.test(link)) {
    return NextResponse.json({ error: "Please enter a valid meeting link (starting with https://)." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, user_id, job_id, status, branch_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application?.user_id) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (session.role === "branch_manager" && application.branch_id !== session.branchId) {
    return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
  }

  const current = normalizeStatus(application.status);
  if (current === "Rejected" || current === "Hired") {
    return NextResponse.json(
      { error: `This application is already ${current.toLowerCase()}; an interview can no longer be scheduled.` },
      { status: 400 }
    );
  }

  const fields = {
    scheduled_at: when.toISOString(),
    venue: interviewMode === "online" ? "Online" : place,
    mode: interviewMode,
    meeting_link: interviewMode === "online" ? link : null,
    notes: (notes ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  // Reschedule the active interview if there is one; otherwise create a new one.
  const { data: active } = await supabase
    .from("interviews")
    .select("id")
    .eq("application_id", applicationId)
    .in("status", ["Scheduled", "Rescheduled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rescheduled = Boolean(active);

  const { data: saved, error } = rescheduled
    ? await supabase
        .from("interviews")
        .update({ ...fields, status: "Rescheduled", applicant_response: "Pending", responded_at: null })
        .eq("id", active!.id)
        .select("*")
        .single()
    : await supabase
        .from("interviews")
        .insert({
          ...fields,
          application_id: applicationId,
          user_id: application.user_id,
          job_id: application.job_id,
          created_by: session.id,
        })
        .select("*")
        .single();

  if (error || !saved) {
    return NextResponse.json({ error: error?.message ?? "Could not save the interview." }, { status: 500 });
  }

  await supabase
    .from("applications")
    .update({ status: "Interview Scheduled", updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  const [{ data: job }, { data: applicant }] = await Promise.all([
    supabase.from("jobs").select("title").eq("id", application.job_id).maybeSingle(),
    supabase.from("profiles").select("email, full_name").eq("user_id", application.user_id).maybeSingle(),
  ]);

  const firstName = (applicant?.full_name ?? "").trim().split(/\s+/)[0];
  const jobTitle = job?.title ?? "your application";
  const heading = rescheduled ? "Interview rescheduled" : "Interview scheduled";
  const note =
    `${firstName ? `Dear ${firstName}` : "Dear Applicant"}\n\n` +
    `${rescheduled ? "Your interview has been rescheduled" : "You are invited to an interview"} for ${jobTitle}.\n\n` +
    `${detailsText(saved as InterviewRow)}\n\n` +
    "Please open the MR.DIY Careers app to confirm that you can attend. If you cannot, choose \"Can't attend\" so we can find another time.";

  await insertAlerts(supabase, [
    {
      user_id: application.user_id,
      type: "INTERVIEW_INVITE",
      title: heading,
      message: `${jobTitle}: ${whenText(saved.scheduled_at)}${
        interviewMode === "online" ? " (online)" : ` at ${saved.venue}`
      }`,
      job_id: application.job_id,
      application_id: applicationId,
    },
  ]);

  await supabase.from("messages").insert({
    sender_id: session.id,
    receiver_id: application.user_id,
    job_id: application.job_id,
    body: note,
    is_read: false,
  });

  const email = await sendApplicantEmail(supabase, {
    userId: application.user_id,
    applicationId,
    to: applicant?.email,
    subject: `${heading}: ${jobTitle}`,
    heading,
    body: note,
    kind: "interview",
    jobTitle: job?.title ?? null,
  });

  return NextResponse.json({ ok: true, interview: saved, rescheduled, status: "Interview Scheduled", email });
}

/** Cancels or completes an interview. Cancelling puts the application back to Shortlisted. */
export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action } = (await request.json()) as { id?: string; action?: "cancel" | "complete" };
  if (!id || (action !== "cancel" && action !== "complete")) {
    return NextResponse.json({ error: "Interview id and a valid action are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: interview } = await supabase.from("interviews").select("*").eq("id", id).maybeSingle();
  if (!interview) {
    return NextResponse.json({ error: "Interview not found." }, { status: 404 });
  }
  if (!["Scheduled", "Rescheduled"].includes(interview.status)) {
    return NextResponse.json({ error: `This interview is already ${interview.status.toLowerCase()}.` }, { status: 400 });
  }

  if (session.role === "branch_manager") {
    const { data: application } = await supabase
      .from("applications")
      .select("branch_id")
      .eq("id", interview.application_id)
      .maybeSingle();
    if (application?.branch_id !== session.branchId) {
      return NextResponse.json({ error: "This application is not in your branch." }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from("interviews")
    .update({ status: action === "cancel" ? "Cancelled" : "Completed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let status: string | null = null;
  let email = null;

  if (action === "cancel") {
    const { data: application } = await supabase
      .from("applications")
      .select("status")
      .eq("id", interview.application_id)
      .maybeSingle();

    if (normalizeStatus(application?.status) === "Interview Scheduled") {
      status = "Shortlisted";
      await supabase
        .from("applications")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", interview.application_id);
    }

    const [{ data: job }, { data: applicant }] = await Promise.all([
      supabase.from("jobs").select("title").eq("id", interview.job_id).maybeSingle(),
      supabase.from("profiles").select("email, full_name").eq("user_id", interview.user_id).maybeSingle(),
    ]);
    const firstName = (applicant?.full_name ?? "").trim().split(/\s+/)[0];
    const jobTitle = job?.title ?? "your application";
    const note =
      `${firstName ? `Dear ${firstName}` : "Dear Applicant"}\n\n` +
      `Your interview for ${jobTitle} on ${whenText(interview.scheduled_at)} has been cancelled. ` +
      "We will contact you with a new schedule.\n\nWe apologize for the inconvenience.";

    await insertAlerts(supabase, [
      {
        user_id: interview.user_id,
        type: "INTERVIEW_INVITE",
        title: "Interview cancelled",
        message: `Your interview for ${jobTitle} was cancelled. We will contact you with a new schedule.`,
        job_id: interview.job_id,
        application_id: interview.application_id,
      },
    ]);

    email = await sendApplicantEmail(supabase, {
      userId: interview.user_id,
      applicationId: interview.application_id,
      to: applicant?.email,
      subject: `Interview cancelled: ${jobTitle}`,
      heading: "Interview cancelled",
      body: note,
      kind: "interview",
      jobTitle: job?.title ?? null,
    });
  }

  return NextResponse.json({ ok: true, status, email });
}
