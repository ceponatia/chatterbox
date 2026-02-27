/**
 * Fact processing — confidence filtering and deduplication.
 *
 * Runs between fact extraction (Stage 1) and state merge (Stage 2).
 * Filters out low-confidence facts and facts already represented in state.
 */

import type { ExtractedFact } from "@/lib/state-history";

/** Minimum confidence to include a fact in the merge. */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Normalize a string for fuzzy comparison: lowercase, collapse whitespace,
 * strip leading punctuation/bullets.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a fact's detail is already represented in the current state.
 * Uses substring matching on normalized text — if the core detail appears
 * in the state, the fact is considered a duplicate.
 */
function isDuplicate(fact: ExtractedFact, stateNormalized: string): boolean {
  const detail = normalize(fact.detail);
  if (detail.length < 10) return false;
  // Check if the full detail or a significant prefix is already in state
  if (stateNormalized.includes(detail)) return true;
  // Check a shorter prefix (first 40 chars) for partial matches
  const prefix = detail.slice(0, 40);
  return prefix.length >= 20 && stateNormalized.includes(prefix);
}

export interface FactProcessingResult {
  /** Facts that passed confidence + dedup filters — ready for merge */
  accepted: ExtractedFact[];
  /** Facts below confidence threshold — held for potential future corroboration */
  lowConfidence: ExtractedFact[];
  /** Facts already represented in state */
  duplicates: ExtractedFact[];
}

/**
 * Filter and deduplicate extracted facts before merge.
 *
 * 1. Confidence filter: facts below threshold are separated out
 * 2. Deduplication: facts already in state are separated out
 * 3. Remaining facts are returned for merge
 */
export function processFacts(
  facts: ExtractedFact[],
  currentState: string,
): FactProcessingResult {
  const stateNormalized = normalize(currentState);
  const accepted: ExtractedFact[] = [];
  const lowConfidence: ExtractedFact[] = [];
  const duplicates: ExtractedFact[] = [];

  for (const fact of facts) {
    // Corrections and superseded markers always pass — they exist to fix stale state
    if (
      fact.type === "correction" ||
      fact.type === "hard_fact_superseded" ||
      fact.type === "thread_resolved"
    ) {
      accepted.push(fact);
    } else if (fact.confidence < CONFIDENCE_THRESHOLD) {
      lowConfidence.push(fact);
    } else if (isDuplicate(fact, stateNormalized)) {
      duplicates.push(fact);
    } else {
      accepted.push(fact);
    }
  }

  return { accepted, lowConfidence, duplicates };
}
