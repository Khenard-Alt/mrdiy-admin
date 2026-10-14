import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminSession } from "@/lib/requireAdminSession";
import {
  buildDraft,
  checkCompliance,
  findSimilarJobs,
  isColdStart,
  type ExistingJob,
} from "@/lib/jobDescriptionGenerator";
import { generateColdStartDraft } from "@/lib/gemini";

/**
 * The Layered AI Job Description Generator (CAPSTONE_ADVANCED_AI_PLANNING.md §5):
 * Layer 1 (TF-IDF retrieval) + Layer 2 (compliance rules) always run. Layer 3
 * (Gemini) only runs on a cold start — no similar posting to draft from — and
 * its output is checked by Layer 2's guardrail before it's trusted; any failure
 * anywhere in Layer 3 (no key, network error, bad output, failed guardrail)
 * falls back to the Layer 2 generic draft, so this endpoint never has nothing
 * to return.
 */
export async function POST(request: NextRequest) {
  const session = requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title, category, level, branchId, contractDurationMonths } = body as {
    title?: string;
    category?: string | null;
    level?: string | null;
    branchId?: string | null;
    contractDurationMonths?: number | null;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "A job title is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const [{ data: existingJobs, error }, { data: branch }] = await Promise.all([
    // Ordered explicitly — Postgres doesn't guarantee row order without this, and ties in
    // similarity (several jobs with the same title) would otherwise pick a different "top
    // 3" on every call, making the draft change for the exact same input (caught live: the
    // same title sometimes returned postings with filled-in Responsibilities, sometimes
    // ones with none, because a different set of same-score postings got picked each time).
    supabase
      .from("jobs")
      .select("id, title, category, level, description, responsibilities, requirements, benefits")
      .order("id")
      .limit(1000),
    branchId
      ? supabase.from("branches").select("name").eq("id", branchId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const target = {
    title: title.trim(),
    category: category ?? null,
    level: level ?? null,
    branchName: branch?.name ?? null,
    contractDurationMonths: contractDurationMonths ?? null,
  };

  const similarJobs = findSimilarJobs(target, (existingJobs ?? []) as ExistingJob[]);
  const coldStart = isColdStart(similarJobs);

  const sourceJobs = (existingJobs ?? []).filter((job) =>
    similarJobs.some((similar) => similar.id === job.id)
  ) as ExistingJob[];

  const layer2Draft = buildDraft(target, sourceJobs);

  if (!coldStart) {
    return NextResponse.json({
      draft: layer2Draft,
      basedOn: similarJobs,
      coldStart,
      warnings: checkCompliance(layer2Draft),
      source: "layer1-retrieval",
    });
  }

  // Cold start: Layer 1 found nothing, so Layer 3 (Gemini) writes the draft.
  const gemini = await generateColdStartDraft(target);

  if (gemini.ok) {
    const warnings = checkCompliance(gemini.draft);
    if (warnings.length === 0) {
      return NextResponse.json({
        draft: gemini.draft,
        basedOn: similarJobs,
        coldStart,
        warnings,
        source: "layer3-gemini",
      });
    }
    // Guardrail failed — fall through to the Layer 2 generic draft below,
    // but surface what Gemini's attempt got flagged for.
    return NextResponse.json({
      draft: layer2Draft,
      basedOn: similarJobs,
      coldStart,
      warnings: checkCompliance(layer2Draft),
      source: "layer2-generic",
      geminiAttemptRejected: warnings,
    });
  }

  return NextResponse.json({
    draft: layer2Draft,
    basedOn: similarJobs,
    coldStart,
    warnings: checkCompliance(layer2Draft),
    source: "layer2-generic",
    geminiUnavailable: gemini.reason,
  });
}
