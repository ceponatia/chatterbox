/**
 * Core types for the segmented prompt assembly system.
 *
 * These types define how prompt segments are structured, when they should
 * be injected, and what the assembler produces as output.
 */

import type { AssemblyContext, AssemblyResult } from "@chatterbox/sockets";

// Re-export socket boundary types used by consumers of this package
export type { AssemblyContext, AssemblyResult };

// ---------------------------------------------------------------------------
// Injection policies — determine when a segment is included
// ---------------------------------------------------------------------------

export type InjectionPolicy =
  | { readonly type: "always" }
  | { readonly type: "every_n"; readonly n: number }
  | { readonly type: "on_topic"; readonly keywords: readonly string[] }
  | { readonly type: "on_state_field"; readonly field: string }
  | { readonly type: "custom"; readonly evaluate: (ctx: AssemblyContext) => boolean };

// ---------------------------------------------------------------------------
// Segment priority levels
// ---------------------------------------------------------------------------

export type SegmentPriority = "critical" | "high" | "normal" | "low";

// ---------------------------------------------------------------------------
// Prompt segment definition
// ---------------------------------------------------------------------------

export interface PromptSegment {
  /** Unique identifier, e.g. "core_rules", "appearance_visual" */
  readonly id: string;

  /** Human-readable name for UI/logging */
  readonly label: string;

  /** The actual text content of this segment */
  readonly content: string;

  /** When should this segment be included? */
  readonly policy: InjectionPolicy;

  /** Relative importance — critical segments are never dropped under budget pressure */
  readonly priority: SegmentPriority;

  /** Ordering weight (lower = earlier in assembled prompt) */
  readonly order: number;

  /** Approximate token count (can be computed once on registration) */
  readonly tokenEstimate: number;

  /**
   * Category for grouping in UI and for the "omitted segments" summary.
   * e.g. "character", "rules", "world", "style"
   */
  readonly category: string;
}
