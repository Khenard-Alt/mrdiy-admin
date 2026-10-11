/**
 * The matching engine behind the match %, mirrored in the Android app (JobMatchingEngine.kt).
 *
 *   text score  = 60% TF-IDF cosine similarity (on stemmed words, so "cashiering" meets "cashier")
 *               + 25% skill coverage (how many of the skills the job asks for the applicant has)
 *               + 15% title fit (does the applicant's position or past roles match the job title)
 *   final score = 70% text score + 30% location proximity   (see combineScore)
 *
 * Besides the score it explains itself: which words matched and how much each contributed,
 * which skills matched and which are missing. Keep the Kotlin version in sync with this one.
 */

import { extractSkills } from "@/lib/skills";

const TOKEN_SPLIT = /[^\p{L}\p{N}+#]+/u;

// Very common words are not shown as "matches" even though they count in the raw score.
const STOP_WORDS = new Set(
  (
    "the and for with that this from have has had are was were will would can could may might shall " +
    "you your our their his her its who whom what when where which while into onto over under about " +
    "after before between through during also any all each other such than then them they these those " +
    "not but out off per via etc one two new more most very well able including include includes " +
    "must work works working worked job jobs role roles position positions company companies"
  ).split(" ")
);

// Different spellings, typos and Tagalog words that mean the same thing.
const SYNONYMS: Record<string, string> = {
  casher: "cashier",
  cashiering: "cashier",
  kahera: "cashier",
  kahero: "cashier",
  benta: "sale",
  tindera: "sale",
  tindero: "sale",
  selling: "sale",
  seller: "sale",
  bodega: "warehouse",
  imbentaryo: "inventory",
  stockroom: "stock",
  stocking: "stock",
  restocking: "stock",
  guard: "security",
  janitor: "cleaning",
  cleaner: "cleaning",
  manager: "management",
  managing: "management",
  supervising: "supervision",
  supervisor: "supervision",
};

/** Lower-cases a word and reduces it to a rough stem so related forms match each other. */
export function normalizeToken(raw: string): string {
  let word = raw.toLowerCase();
  if (SYNONYMS[word]) return SYNONYMS[word];

  if (word.length > 5 && word.endsWith("ing")) word = word.slice(0, -3);
  else if (word.length > 4 && word.endsWith("ies")) word = `${word.slice(0, -3)}y`;
  else if (word.length > 4 && /(ss|x|ch|sh)es$/.test(word)) word = word.slice(0, -2);
  else if (word.length > 4 && word.endsWith("ed")) word = word.slice(0, -2);
  else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) word = word.slice(0, -1);

  return SYNONYMS[word] ?? word;
}

/** Words of at least 3 letters, stemmed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((word) => word.length > 2)
    .map(normalizeToken);
}

function tokenizeWithSurface(text: string): { stems: string[]; surface: Map<string, string> } {
  const stems: string[] = [];
  const surface = new Map<string, string>();
  for (const word of text.toLowerCase().split(TOKEN_SPLIT).filter((w) => w.length > 2)) {
    const stem = normalizeToken(word);
    stems.push(stem);
    if (!surface.has(stem)) surface.set(stem, word);
  }
  return { stems, surface };
}

export type KeywordMatch = {
  /** The stemmed word (use normalizeToken on a resume word to find it). */
  term: string;
  /** The word as written in the resume, for display. */
  label: string;
  /** Percent of the text-similarity score this word accounts for (all matches add up to 100). */
  share: number;
};

export type MatchAnalysis = {
  /** TF-IDF cosine similarity, 0-100. */
  cosine: number;
  keywords: KeywordMatch[];
};

function tfidf(tokens: string[], documentFrequency: Map<string, number>, totalDocs: number) {
  const counts = new Map<string, number>();
  tokens.forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1));

  const vector = new Map<string, number>();
  counts.forEach((count, term) => {
    const df = documentFrequency.get(term) ?? 0;
    const idf = df > 0 ? Math.log(totalDocs / df) + 1 : 0;
    vector.set(term, (count / tokens.length) * idf);
  });
  return vector;
}

/**
 * Compares one applicant document with one job, using every published job as the corpus
 * so word weights match what the app computes.
 */
export function analyzeMatch(profileDoc: string, jobDoc: string, corpusDocs: string[]): MatchAnalysis {
  const profile = tokenizeWithSurface(profileDoc);
  const jobTokens = tokenize(jobDoc);

  if (profile.stems.length === 0 || jobTokens.length === 0) {
    return { cosine: 0, keywords: [] };
  }

  const corpus = [profile.stems, ...corpusDocs.map(tokenize)];
  const documentFrequency = new Map<string, number>();
  corpus.forEach((tokens) => {
    new Set(tokens).forEach((term) =>
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    );
  });

  const profileVector = tfidf(profile.stems, documentFrequency, corpus.length);
  const jobVector = tfidf(jobTokens, documentFrequency, corpus.length);

  let dot = 0;
  const contributions: [string, number][] = [];
  profileVector.forEach((weight, term) => {
    const other = jobVector.get(term);
    if (other) {
      const value = weight * other;
      dot += value;
      contributions.push([term, value]);
    }
  });

  const magnitude = (vector: Map<string, number>) =>
    Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0));
  const denominator = magnitude(profileVector) * magnitude(jobVector);
  const cosine = denominator > 0 ? Math.min(100, Math.round((dot / denominator) * 100)) : 0;

  const meaningful = contributions.filter(([term]) => !STOP_WORDS.has(term));
  const total = meaningful.reduce((sum, [, value]) => sum + value, 0);

  const keywords = meaningful
    .map(([term, value]) => ({
      term,
      label: profile.surface.get(term) ?? term,
      share: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.share - a.share);

  return { cosine, keywords };
}

// ---------------------------------------------------------------------------------------------
// The full text score: cosine + skill coverage + title fit
// ---------------------------------------------------------------------------------------------

export type CandidateScore = {
  /** 0-100, the text part of the match (before location). */
  textScore: number;
  cosine: number;
  /** Share (0-1) of the job's required skills the applicant has; null if the job names no known skill. */
  skillCoverage: number | null;
  /** Share (0-1) of the job title's words found in the applicant's position/roles; null if unknown. */
  titleFit: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  keywords: KeywordMatch[];
};

const WEIGHT_COSINE = 0.6;
const WEIGHT_SKILLS = 0.25;
const WEIGHT_TITLE = 0.15;

export function scoreCandidate(args: {
  /** Skills, summary, resume text and experience of the applicant. */
  profileDoc: string;
  /** Desired position, headline and past job titles of the applicant. */
  positionText: string;
  jobDoc: string;
  jobTitle: string;
  /** Text of every published job (for the word weights). */
  corpusDocs: string[];
}): CandidateScore {
  const { cosine, keywords } = analyzeMatch(args.profileDoc, args.jobDoc, args.corpusDocs);

  const jobSkills = extractSkills(args.jobDoc);
  const profileSkills = new Set(extractSkills(args.profileDoc));
  const matchedSkills = jobSkills.filter((skill) => profileSkills.has(skill));
  const missingSkills = jobSkills.filter((skill) => !profileSkills.has(skill));
  const skillCoverage = jobSkills.length > 0 ? matchedSkills.length / jobSkills.length : null;

  const titleWords = [...new Set(tokenize(args.jobTitle).filter((word) => !STOP_WORDS.has(word)))];
  const positionWords = new Set(tokenize(args.positionText));
  const titleFit =
    titleWords.length > 0 && positionWords.size > 0
      ? titleWords.filter((word) => positionWords.has(word)).length / titleWords.length
      : null;

  const parts: [number, number][] = [[WEIGHT_COSINE, cosine / 100]];
  if (skillCoverage !== null) parts.push([WEIGHT_SKILLS, skillCoverage]);
  if (titleFit !== null) parts.push([WEIGHT_TITLE, titleFit]);
  const weight = parts.reduce((sum, [w]) => sum + w, 0);
  const textScore = Math.min(
    100,
    Math.max(0, Math.round((parts.reduce((sum, [w, value]) => sum + w * value, 0) / weight) * 100))
  );

  return { textScore, cosine, skillCoverage, titleFit, matchedSkills, missingSkills, keywords };
}

// ---------------------------------------------------------------------------------------------
// Shared helpers (used by the applicant review screen, the ranking and notifications)
// ---------------------------------------------------------------------------------------------

/** Flattens strings, arrays and JSON objects (e.g. work_experiences) into searchable text. */
export function jsonText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jsonText).join(" ");
  if (typeof value === "object") return Object.values(value as object).map(jsonText).join(" ");
  return String(value);
}

export type JobDocFields = {
  title?: string | null;
  category?: string | null;
  level?: string | null;
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  benefits?: string | null;
};

/** The text of a job the matching compares against (same fields as the app). */
export function buildJobDoc(job: JobDocFields) {
  return [
    job.title,
    job.category && job.category !== "Not specified" ? job.category : "",
    job.level && job.level !== "Not specified" ? job.level : "",
    job.description,
    job.requirements,
    job.responsibilities,
    job.benefits,
  ]
    .filter(Boolean)
    .join(" ");
}

type ProfileDocFields = {
  skills?: string | null;
  desired_position?: string | null;
  headline?: string | null;
  about?: string | null;
  work_experiences?: unknown;
  education?: unknown;
};

/** The text of an applicant the matching uses; pass the resume text when it is available. */
export function buildProfileDoc(profile: ProfileDocFields | null | undefined, resumeText = "") {
  return [
    profile?.skills,
    profile?.desired_position,
    profile?.headline,
    profile?.about,
    resumeText,
    jsonText(profile?.work_experiences),
    jsonText(profile?.education),
  ]
    .filter(Boolean)
    .join(" ");
}

/** The applicant's desired position, headline and past job titles, for the title-fit part of the score. */
export function buildPositionText(profile: ProfileDocFields | null | undefined): string {
  const roles = Array.isArray(profile?.work_experiences)
    ? (profile!.work_experiences as { role?: string }[]).map((item) => item?.role ?? "")
    : [];
  return [profile?.desired_position, profile?.headline, ...roles].filter(Boolean).join(" ");
}

const LOCATION_WEIGHT = 0.3;
const FULL_SCORE_KM = 1.5; // same city
const ZERO_SCORE_KM = 40; // too far to commute daily

export function proximityScore(distanceKm: number) {
  if (distanceKm <= FULL_SCORE_KM) return 100;
  const remaining = 1 - (distanceKm - FULL_SCORE_KM) / (ZERO_SCORE_KM - FULL_SCORE_KM);
  return Math.min(100, Math.max(0, Math.floor(remaining * 100)));
}

/**
 * The app's final match %: 70% text score + 30% location proximity. When the distance is
 * unknown only the text score is used, so a missing location is not penalised.
 */
export function combineScore(textScore: number, distanceKm: number | null) {
  if (distanceKm === null) return textScore;
  return Math.min(
    100,
    Math.max(0, Math.floor(textScore * (1 - LOCATION_WEIGHT) + proximityScore(distanceKm) * LOCATION_WEIGHT))
  );
}
