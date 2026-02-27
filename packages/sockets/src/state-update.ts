/**
 * State Pipeline Socket
 *
 * Defines the interface for the single-pass hybrid state pipeline.
 * One LLM call reads recent windowed conversation + current state and
 * outputs an updated story state document plus a structured change log.
 *
 * The default implementation is a pass-through that returns the current
 * state unchanged. The real pipeline lives in apps/web under
 * /api/state-update and applies validation, auto-accept scoring, and
 * cascade resets after each LLM call.
 */

import type {
  StatePipelineRequest,
  StatePipelineResult,
  StatePipelineDisposition,
} from "./types";

// ---------------------------------------------------------------------------
// Socket interface
// ---------------------------------------------------------------------------

export interface StatePipelineSocket {
  /**
   * Run the state pipeline: update story state from windowed conversation.
   *
   * @param request  Windowed messages, current state, and turn tracking
   * @returns        Updated state, change log, validation, disposition, and cascade resets
   */
  run(request: StatePipelineRequest): Promise<StatePipelineResult>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

const PASS_VALIDATION = {
  schemaValid: true,
  allHardFactsPreserved: true,
  noUnknownFacts: true,
  outputComplete: true,
  diffPercentage: 0,
} as const;

/** Default: returns current state unchanged. */
export const defaultStatePipeline: StatePipelineSocket = {
  async run(request) {
    return {
      newState: request.currentStoryState,
      changes: [],
      validation: PASS_VALIDATION,
      disposition: "auto_accepted" as StatePipelineDisposition,
      cascadeResets: [],
      turnNumber: request.turnNumber,
    };
  },
};
