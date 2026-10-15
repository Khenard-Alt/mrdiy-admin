import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerFaqQuestion, MAX_QUESTION_LENGTH } from "@/lib/faqAssistant";

/**
 * Public, unauthenticated endpoint (§6.3) — the first-ever Android-to-mrdiy-admin
 * bridge. Deliberately scoped to read-only, non-personal data: it only ever reads a
 * published job posting's own public fields, never anything tied to a specific
 * applicant's account or application (there is no way to verify identity on this
 * request, so it must not expose or accept anything personal).
 *
 * Rate limit below is a best-effort, in-memory, per-IP guard — it resets on redeploy
 * and does not coordinate across multiple server instances. That is a known,
 * accepted limitation for a capstone demo, not a production abuse-prevention system.
 */

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(ip) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  if (isRateLimited(clientIp(request))) {
    return NextResponse.json(
      { ok: false, reason: "rate-limited", error: "Too many questions — please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const { jobId, question } = (await request.json().catch(() => ({}))) as {
    jobId?: string;
    question?: string;
  };

  if (!jobId || typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ ok: false, error: "jobId and a question are required." }, { status: 400 });
  }
  if (question.trim().length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Please keep your question under ${MAX_QUESTION_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title, description, responsibilities, requirements, benefits")
    .eq("id", jobId)
    .eq("status", "published")
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ ok: false, error: "Job posting not found." }, { status: 404 });
  }

  const result = await answerFaqQuestion({ job, question: question.trim() });

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason });
  }
  return NextResponse.json({ ok: true, answer: result.answer });
}
