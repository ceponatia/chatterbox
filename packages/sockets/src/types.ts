/**
 * Core types used across all socket interfaces.
 *
 * These are deliberately minimal and SDK-agnostic. The app is responsible
 * for converting between its internal types (e.g. UIMessage from the AI SDK)
 * and these boundary types.
 */

// ---------------------------------------------------------------------------
// Message types at the socket boundary
// ---------------------------------------------------------------------------

export interface SocketMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
}

// ---------------------------------------------------------------------------
// Assembly context — passed to prompt assembler each turn
// ---------------------------------------------------------------------------

export interface AssemblyContext {
  /** Current turn number (count of user messages) */
  readonly turnNumber: number;

  /** Map of segment ID → turn number when it was last included */
  readonly lastIncludedAt: Readonly<Record<string, number>>;

  /** The user's current message text (for topic detection) */
  readonly currentUserMessage: string;

  /** Current story state fields (for on_state_field checks) */
  readonly stateFields: Readonly<Record<string, string>>;

  /** Entity IDs currently present in the active scene (for on_presence checks) */
  readonly presentEntityIds?: readonly string[];

  /** Total token budget for the system prompt area */
  readonly tokenBudget: number;

  /**
   * Pre-computed semantic similarity scores per segment ID.
   * Values are 0.0–1.0 cosine similarity between the user message
   * and the segment's topic description. Used by on_topic policies
   * as a fallback when keyword matching misses.
   */
  readonly topicScores?: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// State pipeline types
// ---------------------------------------------------------------------------

export interface StatePipelineChange {
  readonly type: string;
  readonly detail: string;
  readonly sourceTurn: number;
  readonly confidence: number;
}

export interface StatePipelineValidation {
  readonly schemaValid: boolean;
  readonly allHardFactsPreserved: boolean;
  readonly noUnknownFacts: boolean;
  readonly outputComplete: boolean;
  readonly diffPercentage: number;
}

export type StatePipelineDisposition = "auto_accepted" | "flagged" | "retried";

export interface CandidateFact {
  readonly id: string;
  readonly content: string;
  readonly confidence: number;
  readonly sourceMessageId: string;
  readonly extractedAt: string;
}

export interface StatePipelineRequest {
  readonly messages: readonly SocketMessage[];
  readonly currentStoryState: string;
  readonly turnNumber: number;
  readonly lastPipelineTurn: number;
}

export interface StatePipelineResult {
  readonly newState: string;
  readonly changes: readonly StatePipelineChange[];
  readonly validation: StatePipelineValidation;
  readonly disposition: StatePipelineDisposition;
  readonly cascadeResets: readonly string[];
  readonly turnNumber: number;
  readonly candidateFacts?: readonly CandidateFact[];
}

// ---------------------------------------------------------------------------
// Post-response context
// ---------------------------------------------------------------------------

export interface PostResponseContext {
  readonly assistantMessage: SocketMessage;
  readonly allMessages: readonly SocketMessage[];
  readonly currentStoryState: string;
  readonly systemPrompt: string;
  readonly turnNumber: number;
}
