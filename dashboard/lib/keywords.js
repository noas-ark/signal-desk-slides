// Search lexicon from Signal Desk slide 01: product names + symptom words,
// used to build per-source queries that surface acute complaints rather
// than marketing copy.

export const PRODUCTS = [
  "Cursor",
  "Claude Code",
  "Copilot",
  "Windsurf",
  "Operator",
  "Comet",
];

export const SYMPTOMS = [
  "loses context",
  "lost context",
  "hallucinate",
  "hallucinating",
  "repeats itself",
  "redoing work",
  "keeps forgetting",
];

// One query per (product, symptom) pair, capped to keep API usage sane on
// each scan run.
export function buildQueries({ maxQueries = 12 } = {}) {
  const queries = [];
  for (const product of PRODUCTS) {
    for (const symptom of SYMPTOMS) {
      queries.push(`${product} ${symptom}`);
      if (queries.length >= maxQueries) return queries;
    }
  }
  return queries;
}
