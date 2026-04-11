/**
 * Tests for the SlowLaneReconciliationSocket contract.
 *
 * Validates that defaultSlowLaneReconciliation is a correct no-op
 * implementation -- it must return all candidates as retained, produce no
 * supersessions or thread reconciliations, and pass the state through unchanged.
 */

import { describe, it, expect } from "vitest";
import {
  defaultSlowLaneReconciliation,
  type SlowLaneRequest,
  type CandidateFact,
} from "../index.js";

const SAMPLE_CANDIDATES: CandidateFact[] = [
  {
    id: "cf-1",
    content: "Alice works at the bakery",
    confidence: 0.45,
    sourceMessageId: "msg-10",
    extractedAt: "2026-04-10",
  },
  {
    id: "cf-2",
    content: "Bob moved to the city last year",
    confidence: 0.38,
    sourceMessageId: "msg-12",
    extractedAt: "2026-04-10",
  },
];

const BASE_REQUEST: SlowLaneRequest = {
  currentStoryState: "## Cast\n\nAlice -- baker\n\n## Scene\n\nA quiet bakery.",
  candidateFacts: SAMPLE_CANDIDATES,
};

describe("defaultSlowLaneReconciliation", () => {
  it("returns all candidates as retained", async () => {
    const result = await defaultSlowLaneReconciliation.reconcile(BASE_REQUEST);
    expect(result.candidateDecisions).toHaveLength(2);
    expect(result.candidateDecisions[0]!.verdict).toBe("retained");
    expect(result.candidateDecisions[1]!.verdict).toBe("retained");
  });

  it("produces no supersessions", async () => {
    const result = await defaultSlowLaneReconciliation.reconcile(BASE_REQUEST);
    expect(result.supersessions).toHaveLength(0);
  });

  it("produces no thread reconciliations", async () => {
    const result = await defaultSlowLaneReconciliation.reconcile(BASE_REQUEST);
    expect(result.threadReconciliations).toHaveLength(0);
  });

  it("passes state through unchanged", async () => {
    const result = await defaultSlowLaneReconciliation.reconcile(BASE_REQUEST);
    expect(result.updatedState).toBe(BASE_REQUEST.currentStoryState);
  });

  it("returns a summary string", async () => {
    const result = await defaultSlowLaneReconciliation.reconcile(BASE_REQUEST);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("works with empty candidates", async () => {
    const result = await defaultSlowLaneReconciliation.reconcile({
      ...BASE_REQUEST,
      candidateFacts: [],
    });
    expect(result.candidateDecisions).toHaveLength(0);
    expect(result.updatedState).toBe(BASE_REQUEST.currentStoryState);
  });
});
