/**
 * TF-IDF text matching, the same method the Android app uses for the match score
 * (JobMatchingEngine.kt): tokenize, weight terms by TF-IDF, compare with cosine similarity.
 * Here it is also used to explain the score: which words in the resume matched the job and
 * how much each one contributed.
 */

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

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((word) => word.length > 2);
}

export type KeywordMatch = {
  term: string;
  /** Percent of the text-similarity score this word accounts for (all matches add up to 100). */
  share: number;
};

export type MatchAnalysis = {
  /** Text similarity 0-100 (before the location part of the app's score). */
  textScore: number;
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
export function analyzeMatch(
  profileDoc: string,
  jobDoc: string,
  corpusDocs: string[]
): MatchAnalysis {
  const profileTokens = tokenize(profileDoc);
  const jobTokens = tokenize(jobDoc);

  if (profileTokens.length === 0 || jobTokens.length === 0) {
    return { textScore: 0, keywords: [] };
  }

  const corpus = [profileTokens, ...corpusDocs.map(tokenize)];
  const documentFrequency = new Map<string, number>();
  corpus.forEach((tokens) => {
    new Set(tokens).forEach((term) =>
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    );
  });

  const profileVector = tfidf(profileTokens, documentFrequency, corpus.length);
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
  const textScore =
    denominator > 0 ? Math.min(100, Math.round((dot / denominator) * 100)) : 0;

  const meaningful = contributions.filter(([term]) => !STOP_WORDS.has(term));
  const total = meaningful.reduce((sum, [, value]) => sum + value, 0);

  const keywords = meaningful
    .map(([term, value]) => ({
      term,
      share: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.share - a.share);

  return { textScore, keywords };
}

// ---------------------------------------------------------------------------------------------
// Shared helpers (used by the applicant review screen and by notifications)
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

const LOCATION_WEIGHT = 0.3;
const FULL_SCORE_KM = 1.5; // same city
const ZERO_SCORE_KM = 40; // too far to commute daily

function proximityScore(distanceKm: number) {
  if (distanceKm <= FULL_SCORE_KM) return 100;
  const remaining = 1 - (distanceKm - FULL_SCORE_KM) / (ZERO_SCORE_KM - FULL_SCORE_KM);
  return Math.min(100, Math.max(0, Math.floor(remaining * 100)));
}

/**
 * The app's final match %: 70% text similarity + 30% location proximity. When the distance is
 * unknown only the text score is used, so a missing location is not penalised.
 */
export function combineScore(textScore: number, distanceKm: number | null) {
  if (distanceKm === null) return textScore;
  return Math.min(100, Math.max(0, Math.floor(textScore * (1 - LOCATION_WEIGHT) + proximityScore(distanceKm) * LOCATION_WEIGHT)));
}
