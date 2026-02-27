/**
 * State Update Socket
 *
 * Defines the interface for updating story state from conversation history.
 * The default implementation is a pass-through that returns the current state
 * unchanged (the app's existing summarization hook handles updates via its
 * own `/api/summarize` endpoint until a real pipeline is wired in).
 */

import type { StateUpdateRequest, StateUpdateResult, ValidationReport } from "./types";

// ---------------------------------------------------------------------------
// Socket interface
// ---------------------------------------------------------------------------

export interface StateUpdateSocket {
  /**
   * Generate an updated story state from conversation history.
   *
   * @param request  Messages, current state, and system prompt
   * @returns        New state + validation report + disposition
   */
  update(request: StateUpdateRequest): Promise<StateUpdateResult>;
}

// ---------------------------------------------------------------------------
// State validation socket (separate — runs after any state update source)
// ---------------------------------------------------------------------------

export interface StateValidationSocket {
  /**
   * Validate a candidate story state against the current state.
   *
   * @param candidate  The proposed new story state
   * @param current    The current story state
   * @returns          Validation report
   */
  validate(candidate: string, current: string): ValidationReport;
}

// ---------------------------------------------------------------------------
// Default implementations
// ---------------------------------------------------------------------------

const PASS_REPORT: ValidationReport = {
  schemaValid: true,
  allSectionsPresent: true,
  hardFactsPreserved: true,
  outputComplete: true,
  diffPercentage: 0,
  errors: [],
};

/** Default: returns current state unchanged. The existing summarization hook
 *  continues to handle state updates until a real pipeline is wired in. */
export const defaultStateUpdate: StateUpdateSocket = {
  async update(request) {
    return {
      newState: request.currentStoryState,
      validation: PASS_REPORT,
      disposition: "auto_accepted",
    };
  },
};

/** Default: all state passes validation. */
export const defaultStateValidation: StateValidationSocket = {
  validate(_candidate, _current) {
    return PASS_REPORT;
  },
};
