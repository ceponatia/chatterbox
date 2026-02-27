/**
 * Auto-accept logic with confidence scoring.
 *
 * Determines disposition based on validation report:
 * - auto_accepted: all checks pass, diff < 30%, no hard facts removed
 * - flagged: mostly passes but something looks off
 * - retried: schema fails or output truncated (caller should retry)
 */

import type { ValidationReport, StateHistoryEntry } from "@/lib/state-history";

export type Disposition = StateHistoryEntry["disposition"];

export function determineDisposition(report: ValidationReport): Disposition {
  // Reject and retry: schema fails or output incomplete
  if (!report.schemaValid || !report.outputComplete) {
    return "retried";
  }

  // Flag for review: massive diff (possible hallucination)
  if (report.diffPercentage > 50) {
    return "flagged";
  }

  // Flag: unknown facts injected (possible hallucination)
  if (!report.noUnknownFacts) {
    return "flagged";
  }

  // Auto-accept: everything looks good
  return "auto_accepted";
}
