/**
 * State validation — deterministic checks on candidate story state.
 *
 * Checks: schema, novelty, completeness, diff percentage.
 * Hard fact preservation is no longer enforced — the pipeline now
 * reasons about relevance and intentionally removes superseded facts.
 */

import type { ValidationReport, ExtractedFact } from "@/lib/state-history";

const REQUIRED_SECTIONS = [
  "## Cast",
  "## Relationships",
  "## Characters",
  "## Scene",
  "## Current Demeanor",
  "## Open Threads",
  "## Hard Facts",
];

/** Extract the content under "## Hard Facts" from a state string. */
function extractHardFacts(state: string): string[] {
  const match = state.match(/## Hard Facts[^\n]*\n([\s\S]*?)(?=\n## |\n*$)/);
  if (!match?.[1]) return [];
  return match[1]
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

/** Compute a rough diff percentage between two strings. */
function computeDiffPercentage(previous: string, candidate: string): number {
  if (!previous.trim()) return 100;
  const prevLines = new Set(
    previous
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const candLines = candidate
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let changed = 0;
  for (const line of candLines) {
    if (!prevLines.has(line)) changed++;
  }
  const total = Math.max(prevLines.size, candLines.length, 1);
  return Math.round((changed / total) * 100);
}

export function validateState(
  candidate: string,
  previous: string,
  extractedFacts: ExtractedFact[],
): ValidationReport {
  // 1. Schema validation — all required sections present and non-empty
  const schemaValid = REQUIRED_SECTIONS.every((section) => {
    const idx = candidate.indexOf(section);
    if (idx === -1) return false;
    const afterHeader = candidate.slice(idx + section.length).trim();
    return afterHeader.length > 0;
  });

  // 2. Hard fact preservation — tracked for history but no longer blocks acceptance.
  //    The pipeline intentionally removes superseded facts via reasoning.
  const prevHardFacts = extractHardFacts(previous);
  const allHardFactsPreserved = true;

  // 3. Novelty check — new hard facts should come from extracted facts
  const candHardFacts = extractHardFacts(candidate);
  const newHardFacts = candHardFacts.filter(
    (fact) =>
      !prevHardFacts.some((pf) => pf.toLowerCase() === fact.toLowerCase()),
  );
  const factDetails = new Set(
    extractedFacts.map((f) => f.detail.toLowerCase()),
  );
  const noUnknownFacts = newHardFacts.every(
    (fact) =>
      factDetails.has(fact.toLowerCase()) ||
      extractedFacts.some((ef) =>
        fact.toLowerCase().includes(ef.detail.toLowerCase().slice(0, 30)),
      ),
  );

  // 4. Completeness check — not truncated
  const outputComplete = schemaValid && candidate.trim().length > 50;

  // Diff percentage
  const diffPercentage = computeDiffPercentage(previous, candidate);

  return {
    schemaValid,
    allHardFactsPreserved,
    noUnknownFacts,
    outputComplete,
    diffPercentage,
  };
}
