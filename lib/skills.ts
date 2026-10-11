/**
 * Skill vocabulary used to compare what a job asks for with what an applicant has.
 * Same list as ResumeSkills.kt in the Android app (keep them in sync), plus a few common aliases.
 */

export const SKILLS = [
  "customer service", "cash handling", "cashier", "point of sale", "POS",
  "inventory", "stock management", "merchandising", "sales", "retail",
  "leadership", "teamwork", "communication", "supervision", "staff scheduling",
  "warehouse", "logistics", "forklift", "picking", "packing", "delivery",
  "recruitment", "payroll", "human resources", "accounting", "bookkeeping",
  "Excel", "Microsoft Office", "data entry", "administration", "training",
  "Kotlin", "Java", "Android", "Python", "JavaScript", "React", "SQL",
  "Git", "Docker", "AWS", "Firebase", "machine learning", "data analysis",
  "HTML", "CSS", "Node", "Flutter",
];

/** Other ways people write the same skill; each maps to the skill name above (lower case). */
const ALIASES: Record<string, string> = {
  "pos": "point of sale",
  "customer care": "customer service",
  "client service": "customer service",
  "cashiering": "cashier",
  "cash register": "cash handling",
  "stock control": "stock management",
  "inventory management": "inventory",
  "ms office": "microsoft office",
  "office applications": "microsoft office",
  "spreadsheets": "excel",
  "team work": "teamwork",
  "team player": "teamwork",
  "people management": "supervision",
  "hr": "human resources",
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PATTERNS: { canonical: string; regex: RegExp }[] = [
  ...SKILLS.map((skill) => ({ canonical: skill.toLowerCase(), term: skill.toLowerCase() })),
  ...Object.entries(ALIASES).map(([alias, canonical]) => ({ canonical, term: alias })),
].map(({ canonical, term }) => ({
  canonical,
  regex: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "iu"),
}));

/** The skills (lower case, canonical names) that appear in the text, whichever way they are written. */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const { canonical, regex } of PATTERNS) {
    if (regex.test(text)) found.add(canonical);
  }
  return [...found];
}
