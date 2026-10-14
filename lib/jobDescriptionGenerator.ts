/**
 * Layer 1 (own ML) + Layer 2 (own rules) of the AI Job Description Generator.
 * See CAPSTONE_ADVANCED_AI_PLANNING.md §5 for the full architecture — Layer 3
 * (Gemini) is a separate module, called only when this layer reports a cold
 * start (no similar existing posting to draft from).
 */

import { analyzeMatch, buildJobDoc, type JobDocFields } from "@/lib/matching";

export type GeneratorInput = {
  title: string;
  category?: string | null;
  level?: string | null;
  branchName?: string | null;
  contractDurationMonths?: number | null;
};

export type ExistingJob = JobDocFields & { id: string };

export type SimilarJob = {
  id: string;
  title: string;
  similarity: number;
};

export type Draft = {
  aboutRole: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
};

export type ComplianceWarning = {
  message: string;
};

const MANDATORY_BENEFITS = ["SSS", "PhilHealth", "Pag-IBIG"];

// Minimum similarity (0-100) before a posting counts as a real precedent —
// below this, Layer 1 has nothing worth drafting from (cold start). Calibrated
// against live data, not guessed: the target doc here is only a few words
// (title/category/level), so its cosine against a full job posting (which has
// a full description/requirements/benefits) is naturally much lower than a
// resume-to-job match would be. Live tests: an exact title match ("Cashier"
// vs an existing "Cashier" posting) scores ~16; a clearly unrelated title
// ("Veterinary Surgeon") scores 0; a close variant ("Senior Cashier") scores
// ~7. 5 separates "related" from "unrelated" without excluding real matches.
const SIMILARITY_THRESHOLD = 5;
const MAX_SOURCES = 3;
const MAX_BULLETS_PER_SECTION = 6;

/**
 * Layer 1: ranks every existing published job by similarity to the new one being
 * drafted (title/category/level only — there's no description yet, that's what
 * we're generating). Reuses the same TF-IDF + cosine engine as resume matching,
 * just pointed at job-to-job instead of resume-to-job.
 */
export function rankJobsBySimilarity(target: GeneratorInput, existingJobs: ExistingJob[]): SimilarJob[] {
  // The title is repeated to outweigh category/level in the TF-IDF vector —
  // without this, a rarer word like "Entry" or "Sales" (high IDF, since few
  // other postings use it) can out-score "Cashier" itself (common across many
  // postings, so lower IDF) and pull the match toward an unrelated job that
  // happens to mention the category/level word a lot. Caught live: "Cashier"
  // + category "Sales" + level "Entry" matched "Assistant Store Supervisor"
  // instead of the actual Cashier postings, until this fix.
  const targetDoc = buildJobDoc({
    title: `${target.title} ${target.title} ${target.title}`,
    category: target.category,
    level: target.level,
  });
  const corpusDocs = existingJobs.map(buildJobDoc);

  return existingJobs
    .map((job) => {
      const { cosine } = analyzeMatch(targetDoc, buildJobDoc(job), corpusDocs);
      return { id: job.id, title: job.title ?? "Untitled job", similarity: cosine };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

export function findSimilarJobs(target: GeneratorInput, existingJobs: ExistingJob[]): SimilarJob[] {
  return rankJobsBySimilarity(target, existingJobs)
    .filter((item) => item.similarity >= SIMILARITY_THRESHOLD)
    .slice(0, MAX_SOURCES);
}

function splitBullets(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n|•|^-\s*/m)
    .map((line) => line.replace(/^[-•\s]+/, "").trim())
    .filter((line) => line.length > 3);
}

/** Merges bullet lines from multiple source jobs, keeping first occurrence order and no duplicates. */
function mergeBullets(sourceJobs: ExistingJob[], field: "responsibilities" | "requirements" | "benefits"): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const job of sourceJobs) {
    for (const bullet of splitBullets(job[field])) {
      const key = bullet.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(bullet);
      if (merged.length >= MAX_BULLETS_PER_SECTION) return merged;
    }
  }
  return merged;
}

// Used only when there are zero source postings to retrieve from (true cold start,
// and Gemini wasn't used or wasn't available) — a small pool per section instead of
// one fixed phrasing/empty array, so two cold-start drafts in a row don't come out
// identically bare. HR still edits before publishing either way; this is a better
// starting point than blank sections, not a finished posting.
const GENERIC_ABOUT_TEMPLATES: ((target: GeneratorInput, levelText: string, branchText: string) => string)[] = [
  (t, lvl, br) => `MR.DIY is looking for a ${t.title}${lvl} to join our team${br}.`,
  (t, lvl, br) => `Join MR.DIY as a ${t.title}${lvl}${br} and be part of our growing retail family.`,
  (t, lvl, br) => `We're hiring a ${t.title}${lvl}${br} to help us deliver great service to our customers.`,
];

// Same idea as GENERIC_ABOUT_TEMPLATES above, but for the common case (similar postings
// exist) — this was fixed to one sentence until caught live: clicking Generate again for
// the same title always showed the identical preview text, because only the cold-start
// path had been given a pool. Both paths now vary the same way.
const RETRIEVAL_ABOUT_TEMPLATES: ((target: GeneratorInput, levelText: string, branchText: string) => string)[] = [
  (t, lvl, br) =>
    `As a ${t.title}${lvl}, you will join the MR.DIY team${br}, working in a fast-paced retail environment focused on excellent customer service and store operations.`,
  (t, lvl, br) =>
    `MR.DIY is hiring a ${t.title}${lvl}${br} — someone who thrives in a fast-paced retail environment and takes pride in great customer service.`,
  (t, lvl, br) =>
    `We're growing our team${br} and looking for a ${t.title}${lvl} who's ready to contribute to MR.DIY's retail operations.`,
];

const GENERIC_RESPONSIBILITIES_POOL = [
  "Perform assigned duties as directed by the branch manager or supervisor",
  "Maintain a clean, organized and safe work area at all times",
  "Follow MR.DIY's standard operating procedures and company policies",
  "Provide excellent, friendly customer service",
  "Assist with store opening and closing procedures as needed",
  "Coordinate with other staff and departments to meet store goals",
  "Report any issues, concerns or incidents to management promptly",
];

const GENERIC_REQUIREMENTS_POOL = [
  "At least high school graduate; college level or graduate preferred",
  "Good communication and interpersonal skills",
  "Able to work shifting schedules, including weekends and holidays",
  "Honest, hardworking and able to work well in a team",
  "Basic computer literacy",
  "Physically fit and able to stand for extended periods",
];

function pickRandom<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Picks exactly one item uniformly at random. Deliberately not `pickRandom(pool, 1)[0]`
 * — the `sort(() => Math.random() - 0.5)` shuffle above is a known-biased technique
 * (comparator-based sorts don't guarantee a uniform permutation), and it showed that
 * bias live here: across several live test batches, the same template came back every
 * time within a batch (not the ~33% split 3 templates should give). A direct random
 * index has no such bias.
 */
function pickOne<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Layer 2: assembles a draft from the top similar postings (retrieval-based —
 * merged from up to MAX_SOURCES jobs, never a copy of just one), then fills in
 * MR.DIY-standard sections a retrieval alone wouldn't know to add.
 */
export function buildDraft(target: GeneratorInput, sourceJobs: ExistingJob[]): Draft {
  const hasSources = sourceJobs.length > 0;
  const responsibilities = hasSources
    ? mergeBullets(sourceJobs, "responsibilities")
    : pickRandom(GENERIC_RESPONSIBILITIES_POOL, 4);
  const requirements = hasSources
    ? mergeBullets(sourceJobs, "requirements")
    : pickRandom(GENERIC_REQUIREMENTS_POOL, 4);
  const benefits = hasSources ? mergeBullets(sourceJobs, "benefits") : [];

  // Layer 2 rule: mandatory benefits must appear even if no source posting listed them.
  for (const benefit of MANDATORY_BENEFITS) {
    if (!benefits.some((line) => line.toUpperCase().includes(benefit.toUpperCase()))) {
      benefits.push(`${benefit} contribution`);
    }
  }
  if (target.contractDurationMonths) {
    benefits.push(`${target.contractDurationMonths}-month contract`);
  }

  const levelText = target.level && target.level !== "Not specified" ? ` (${target.level} level)` : "";
  const branchText = target.branchName ? ` at MR.DIY ${target.branchName}` : "";
  const aboutRole = hasSources
    ? pickOne(RETRIEVAL_ABOUT_TEMPLATES)(target, levelText, branchText)
    : pickOne(GENERIC_ABOUT_TEMPLATES)(target, levelText, branchText);

  return { aboutRole, responsibilities, requirements, benefits };
}

// Patterns a job posting must never contain — RA 10911, Anti-Age Discrimination in Employment Act,
// plus common sex-discrimination phrasing that also violates Philippine labor law.
const BANNED_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\b(\d{1,2})\s*(-|to)\s*(\d{1,2})\s*years?\s*old\b/i,
    message: "Age range detected — remove before publishing (RA 10911, Anti-Age Discrimination in Employment Act).",
  },
  {
    pattern: /\bnot\s*(?:be\s*)?(older|younger)\s*than\s*\d{1,2}\b/i,
    message: "Age limit wording detected — remove before publishing (RA 10911).",
  },
  {
    pattern: /\b(below|under|over|above)\s*\d{1,2}\s*years?\s*old\b/i,
    message: "Age limit wording detected — remove before publishing (RA 10911).",
  },
  {
    pattern: /\b(male|female)\s*(only|applicants?\s*only|preferred)\b/i,
    message: "Sex-specific hiring wording detected — remove before publishing.",
  },
];

/**
 * Layer 2 guardrail: runs on every draft (Layer 1+2's own output, and again on
 * whatever Layer 3/Gemini returns) — same function both times, so the check
 * can't drift between the two call sites.
 */
export function checkCompliance(draft: Draft): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const fullText = [draft.aboutRole, ...draft.responsibilities, ...draft.requirements, ...draft.benefits].join(" ");

  for (const { pattern, message } of BANNED_PATTERNS) {
    if (pattern.test(fullText)) warnings.push({ message });
  }

  for (const benefit of MANDATORY_BENEFITS) {
    if (!draft.benefits.some((line) => line.toUpperCase().includes(benefit.toUpperCase()))) {
      warnings.push({ message: `Missing mandatory benefit: ${benefit}.` });
    }
  }

  if (draft.responsibilities.length === 0) warnings.push({ message: "No responsibilities listed." });
  if (draft.requirements.length === 0) warnings.push({ message: "No requirements listed." });

  return warnings;
}

export function isColdStart(similarJobs: SimilarJob[]): boolean {
  return similarJobs.length < 2;
}
