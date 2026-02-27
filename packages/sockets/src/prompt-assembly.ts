/**
 * Prompt Assembly Socket
 *
 * Defines the interface for assembling the system prompt string sent to the
 * inference endpoint each turn. The default implementation reproduces the
 * current `buildSystem()` behavior (flat concatenation).
 */

import type { AssemblyContext } from "./types";

// ---------------------------------------------------------------------------
// Assembly result
// ---------------------------------------------------------------------------

export interface AssemblyResult {
  /** The assembled system prompt string */
  readonly systemPrompt: string;

  /** IDs of segments that were included this turn */
  readonly included: readonly string[];

  /** IDs of segments that were omitted, with reasons */
  readonly omitted: readonly { id: string; reason: string }[];

  /** Approximate total tokens used by the assembled prompt */
  readonly tokenEstimate: number;
}

// ---------------------------------------------------------------------------
// Socket interface
// ---------------------------------------------------------------------------

export interface PromptAssemblySocket {
  /**
   * Assemble the system prompt for a single inference call.
   *
   * @param systemPrompt  Raw system prompt text (from user/config)
   * @param storyState    Current story state text
   * @param context       Turn-level context for conditional injection
   * @returns             Assembled prompt string + metadata
   */
  assemble(
    systemPrompt: string,
    storyState: string,
    context: AssemblyContext,
  ): AssemblyResult;
}

// ---------------------------------------------------------------------------
// Default implementation — reproduces current buildSystem() behavior
// ---------------------------------------------------------------------------

export const defaultPromptAssembly: PromptAssemblySocket = {
  assemble(systemPrompt, storyState, _context) {
    const assembled = storyState
      ? `${systemPrompt}\n\n## Current Story State\n${storyState}`
      : systemPrompt;

    return {
      systemPrompt: assembled,
      included: ["monolithic"],
      omitted: [],
      tokenEstimate: Math.ceil(assembled.length / 4),
    };
  },
};
