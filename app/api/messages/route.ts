import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import { insertAlerts } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: messageData, error: messageError } = await supabase
    .from("messages")
    .select("id, sender_id, receiver_id, job_id, body, is_read, created_at")
    .or(`sender_id.eq.${session.id},receiver_id.eq.${session.id}`)
    .order("created_at", { ascending: true });

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  const rows = messageData ?? [];

  const applicantIds = [
    ...new Set(rows.map((row) => (row.sender_id === session.id ? row.receiver_id : row.sender_id))),
  ];

  let profiles: { id: string; full_name: string | null; email: string | null }[] = [];

  if (applicantIds.length > 0) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id:user_id, full_name, email")
      .in("user_id", applicantIds);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    profiles = profileData ?? [];
  }

  return NextResponse.json({ adminId: session.id, messages: rows, profiles });
}

export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { receiverId, jobId, text } = body;

  if (!receiverId || !text?.trim()) {
    return NextResponse.json({ error: "Message body and receiver are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (session.role === "branch_manager") {
    const { data: inBranch } = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", receiverId)
      .eq("branch_id", session.branchId)
      .limit(1)
      .maybeSingle();
    if (!inBranch) {
      return NextResponse.json({ error: "This applicant is not in your branch." }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      sender_id: session.id,
      receiver_id: receiverId,
      job_id: jobId ?? null,
      body: text.trim(),
      is_read: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also surface it in the applicant's notifications; the message itself is already saved.
  await insertAlerts(supabase, [
    {
      user_id: receiverId,
      type: "MESSAGE",
      title: "New message from MR.DIY HR",
      message: text.trim().length > 90 ? `${text.trim().slice(0, 90)}…` : text.trim(),
      job_id: jobId ?? null,
    },
  ]);

  return NextResponse.json({ message: data });
}

export async function PATCH(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { ids } = body as { ids: string[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("messages").update({ is_read: true }).in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
