/**
 * Hiring Velocity Estimator: how many business days it may take until the applicant can start.
 * Answers the panel comment about telling applicants how fast they can start.
 *
 *   base            7 business days
 *   match >= 85%    -2   (strong fit, hire quickly)
 *   match < 50%     +3   (lacks core skills, needs more evaluation)
 *   profile + resume complete   -1
 *   all pre-employment documents verified   -1
 *
 * The result is shown as a range of one day either side, e.g. "Estimated start: 2 - 4 business days".
 * The Android app has the same formula (HiringVelocity.kt); keep the two in sync.
 */

export type VelocityInput = {
  /** Match % saved when the applicant applied; null if unknown. */
  matchScore: number | null;
  /** Name, phone, location, desired position, skills and an uploaded resume are all present. */
  profileComplete: boolean;
  /** Number of verified pre-employment documents and how many are required (0 if not created yet). */
  documentsVerified: number;
  documentsTotal: number;
};

export type VelocityEstimate = {
  minDays: number;
  maxDays: number;
  label: string;
  /** Plain-language reasons behind the estimate, for the "why". */
  factors: string[];
};

export const BASE_BUSINESS_DAYS = 7;

export function estimateVelocity(input: VelocityInput): VelocityEstimate {
  let days = BASE_BUSINESS_DAYS;
  const factors = [`Base time: ${BASE_BUSINESS_DAYS} business days`];

  if (input.matchScore !== null) {
    if (input.matchScore >= 85) {
      days -= 2;
      factors.push(`Strong match (${input.matchScore}%): -2 days`);
    } else if (input.matchScore < 50) {
      days += 3;
      factors.push(`Lower match (${input.matchScore}%): +3 days for further evaluation`);
    }
  }

  if (input.profileComplete) {
    days -= 1;
    factors.push("Complete profile and resume: -1 day");
  }

  if (input.documentsTotal > 0 && input.documentsVerified >= input.documentsTotal) {
    days -= 1;
    factors.push("All pre-employment documents verified: -1 day");
  }

  days = Math.max(1, days);
  const minDays = Math.max(1, days - 1);
  const maxDays = days + 1;

  return {
    minDays,
    maxDays,
    label: `Estimated start: ${minDays} - ${maxDays} business days`,
    factors,
  };
}
