import { combineScore, normalizeToken, tokenize, type CandidateScore } from "@/lib/matching";
import { extractSkills } from "@/lib/skills";
import { NEAR_ME_RADIUS_KM } from "@/lib/location";

/**
 * Strengths, weaknesses and a plain-language explanation of an applicant's rank for a job.
 * Answers the panel comments about a ranking with strengths and weaknesses, and an automated
 * explanation of the ranking results. Everything comes from the same data as the match %, so the
 * explanation always agrees with the number.
 */

export type DiagnosticInput = {
  name: string;
  jobTitle: string;
  jobRequirements: string | null;
  jobLevel?: string | null;
  profile: {
    skills?: string | null;
    years_experience?: string | number | null;
    education?: unknown;
    work_experiences?: unknown;
    resumeText?: string;
    hasResume: boolean;
  };
  score: CandidateScore;
  distanceKm: number | null;
  rank: number;
  total: number;
};

export type Diagnostic = {
  finalScore: number;
  strengths: string[];
  weaknesses: string[];
  explanation: string;
};

const STOPWORDS_REQ = new Set(
  ("with without have has able good strong excellent proficient knowledge skills skill ability experience experienced " +
    "least years year minimum preferred required requirement willing work working must basic advantage related").split(" ")
);

function requirementLines(text: string | null): string[] {
  return (text ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*]+/, "").trim())
    .filter(Boolean);
}

function listText(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function educationNames(value: unknown): string {
  return Array.isArray(value)
    ? (value as { degree?: string }[]).map((item) => item?.degree ?? "").join(" ").toLowerCase()
    : "";
}

export function diagnose(input: DiagnosticInput): Diagnostic {
  const { score, distanceKm } = input;
  const finalScore = combineScore(score.textScore, distanceKm);
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // --- skills the job asks for
  if (score.matchedSkills.length > 0) {
    strengths.push(`Has ${score.matchedSkills.length} of the ${score.matchedSkills.length + score.missingSkills.length} skills this job asks for: ${listText(score.matchedSkills.slice(0, 5))}`);
  }
  if (score.missingSkills.length > 0) {
    weaknesses.push(`Does not show these required skills: ${listText(score.missingSkills.slice(0, 5))}`);
  }

  // --- years of experience
  const years = Number(input.profile.years_experience ?? 0) || 0;
  const requirements = requirementLines(input.jobRequirements);
  let neededYears = 0;
  for (const line of requirements) {
    const match = line.match(/(\d+)\s*\+?\s*(?:year|yr)/i);
    if (match) neededYears = Math.max(neededYears, Number(match[1]));
  }
  if (neededYears > 0) {
    if (years >= neededYears) strengths.push(`${years} years of experience (the job asks for ${neededYears}+)`);
    else weaknesses.push(`${years} year${years === 1 ? "" : "s"} of experience; the job asks for ${neededYears}+`);
  } else if (years >= 3) {
    strengths.push(`${years} years of experience`);
  }

  // --- education
  const education = educationNames(input.profile.education);
  const wantsDegree = requirements.some((line) => /bachelor|degree|college graduate/i.test(line));
  if (wantsDegree) {
    if (/bachelor|bs |b\.s|bsit|college|degree|licentiate/.test(education)) strengths.push("Has a college degree, as required");
    else if (education) weaknesses.push("Education may not meet the required degree");
    else weaknesses.push("No education listed (the job asks for a degree)");
  }

  // --- requirement lines that nothing in the profile touches
  const resumeWords = new Set(
    tokenize(`${input.profile.skills ?? ""} ${input.profile.resumeText ?? ""} ${JSON.stringify(input.profile.work_experiences ?? "")}`)
  );
  const unmet: string[] = [];
  for (const line of requirements) {
    if (/\d+\s*\+?\s*(?:year|yr)/i.test(line) || /bachelor|degree|college|high school/i.test(line)) continue;
    const words = [...new Set(tokenize(line).filter((word) => word.length > 3 && !STOPWORDS_REQ.has(word)))];
    if (words.length === 0) continue;
    const covered = words.filter((word) => resumeWords.has(word) || resumeWords.has(normalizeToken(word))).length;
    const skillsInLine = extractSkills(line);
    if (covered / words.length < 0.34 && skillsInLine.length === 0) {
      unmet.push(line.length > 90 ? `${line.slice(0, 87)}...` : line);
    }
  }
  unmet.slice(0, 2).forEach((line) => weaknesses.push(`Nothing in the profile shows: "${line}"`));

  // --- position fit
  if (score.titleFit !== null) {
    if (score.titleFit >= 0.5) strengths.push("Desired position or past roles match this job");
    else if (score.titleFit === 0) weaknesses.push("Desired position and past roles do not match this job");
  }

  // --- location
  if (distanceKm !== null) {
    if (distanceKm <= NEAR_ME_RADIUS_KM) {
      strengths.push(distanceKm < 1.5 ? "Lives in the same area as the branch" : `Lives near the branch (~${Math.floor(distanceKm)} km)`);
    } else if (distanceKm > 25) {
      weaknesses.push(`Lives far from the branch (~${Math.floor(distanceKm)} km)`);
    }
  }

  // --- resume
  if (!input.profile.hasResume) weaknesses.push("No resume uploaded");

  if (strengths.length === 0) strengths.push("No clear strength found against this job yet");
  if (weaknesses.length === 0) weaknesses.push("No clear gap found against this job");

  // --- the explanation sentence
  const required = score.matchedSkills.length + score.missingSkills.length;
  const parts: string[] = [
    `${input.name || "This applicant"} is ranked #${input.rank} of ${input.total} with a ${finalScore}% match for ${input.jobTitle}.`,
    `The text of the profile and resume is ${score.textScore}% similar to the job`,
  ];
  if (required > 0) {
    parts[1] += `, and it covers ${score.matchedSkills.length} of ${required} required skills${
      score.matchedSkills.length > 0 ? ` (${listText(score.matchedSkills.slice(0, 4))})` : ""
    }`;
  }
  if (distanceKm !== null) {
    parts[1] += `; the branch is ${distanceKm < 1.5 ? "in the same area" : `about ${Math.floor(distanceKm)} km away`}`;
  }
  parts[1] += ".";
  if (years > 0) parts.push(`Experience: ${years} year${years === 1 ? "" : "s"}.`);
  const gap = weaknesses[0];
  if (!gap.startsWith("No clear gap")) parts.push(`Main gap: ${gap.charAt(0).toLowerCase()}${gap.slice(1)}.`);

  return { finalScore, strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 5), explanation: parts.join(" ") };
}
