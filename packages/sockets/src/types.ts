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

  /** Total token budget for the system prompt area */
  readonly tokenBudget: number;
}

// ---------------------------------------------------------------------------
// State update types
// ---------------------------------------------------------------------------

export interface StateUpdateRequest {
  readonly messages: readonly SocketMessage[];
  readonly currentStoryState: string;
  readonly systemPrompt: string;
}

export interface ValidationReport {
  readonly schemaValid: boolean;
  readonly allSectionsPresent: boolean;
  readonly hardFactsPreserved: boolean;
  readonly outputComplete: boolean;
  readonly diffPercentage: number;
  readonly errors: readonly string[];
}

export interface StateUpdateResult {
  readonly newState: string;
  readonly validation: ValidationReport;
  readonly disposition: "auto_accepted" | "flagged" | "rejected";
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
