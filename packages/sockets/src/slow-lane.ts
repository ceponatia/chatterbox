/**
 * Slow-Lane Reconciliation Socket
 *
 * Defines the interface for the slow-lane reconciliation pipeline.
 * Unlike the fast-lane StatePipelineSocket which processes recent messages
 * in near-realtime, the slow lane reviews accumulated candidate facts,
 * detects contradictions, resolves stale threads, and promotes or rejects
 * staged data on a longer cadence.
 *
 * The default implementation is a no-op that returns all candidates
 * unchanged. The real pipeline lives in apps/web and uses an LLM call
 * with a dedicated reconciliation prompt.
 */

import type { CandidateFact } from "./types.js";

// ---------------------------------------------------------------------------
// Request / Result types
// ---------------------------------------------------------------------------

export type CandidateVerdict = "promoted" | "rejected" | "retained";

export interface CandidateFactDecision {
  readonly candidateId: string;
  readonly verdict: CandidateVerdict;
  /** For promoted: the fact text to add to hardFacts. For rejected: reason. */
  readonly detail: string;
}

export interface SupersessionUpdate {
  /** Substring of the existing hard fact's `fact` field to identify it */
  readonly existingFactSnippet: string;
  /** The new or corrected fact that supersedes it */
  readonly supersededBy: string;
}

export type ThreadReconciliationAction = "resolve" | "archive" | "retain";

export interface ThreadReconciliation {
  /** Substring of the thread description to identify it */
  readonly threadSnippet: string;
  readonly action: ThreadReconciliationAction;
  readonly rationale: string;
}

export interface SlowLaneRequest {
  /** Current structured story state as markdown */
  readonly currentStoryState: string;
  /** Accumulated candidate facts awaiting review */
  readonly candidateFacts: readonly CandidateFact[];
  /** Optional recent messages summary for context (not the full history) */
  readonly recentContext?: string;
}

export interface SlowLaneResult {
  /** Decisions for each candidate fact */
  readonly candidateDecisions: readonly CandidateFactDecision[];
  /** Hard facts to mark as superseded */
  readonly supersessions: readonly SupersessionUpdate[];
  /** Thread status changes */
  readonly threadReconciliations: readonly ThreadReconciliation[];
  /** Updated story state markdown (with promoted facts applied) */
  readonly updatedState: string;
  /** Summary of what changed for logging/UI */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Socket interface
// ---------------------------------------------------------------------------

export interface SlowLaneReconciliationSocket {
  /**
   * Run slow-lane reconciliation on accumulated candidate facts.
   *
   * @param request  Current state, pending candidates, and optional context
   * @returns        Candidate decisions, supersessions, thread updates, and new state
   */
  reconcile(request: SlowLaneRequest): Promise<SlowLaneResult>;
}

// ---------------------------------------------------------------------------
// Default implementation (no-op)
// ---------------------------------------------------------------------------

/** Default: returns all candidates as retained, no changes to state. */
export const defaultSlowLaneReconciliation: SlowLaneReconciliationSocket = {
  async reconcile(request) {
    return {
      candidateDecisions: request.candidateFacts.map((candidateFact) => ({
        candidateId: candidateFact.id,
        verdict: "retained" as CandidateVerdict,
        detail: "",
      })),
      supersessions: [],
      threadReconciliations: [],
      updatedState: request.currentStoryState,
      summary: "No reconciliation performed (default no-op).",
    };
  },
};
