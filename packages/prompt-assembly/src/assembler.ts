/**
 * PromptAssembler — the core engine for segmented prompt assembly.
 *
 * Evaluates segment policies against the current turn context, sorts by
 * priority and order, enforces a token budget, and produces an AssemblyResult.
 */

import type { AssemblyContext, AssemblyResult } from "@chatterbox/sockets";
import type { PromptSegment, InjectionPolicy, SegmentPriority } from "./types";
import { estimateTokens } from "./token-estimator";
import { matchesTopicKeywords } from "./topic-detector";

// ---------------------------------------------------------------------------
// Priority ordering (lower = more important)
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<SegmentPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

const SEMANTIC_THRESHOLD = 0.5;

/** Check on_topic via keyword match, then semantic fallback. */
function evaluateOnTopic(
  keywords: readonly string[],
  segmentId: string,
  ctx: AssemblyContext,
): boolean {
  if (matchesTopicKeywords(ctx.currentUserMessage, keywords)) return true;
  const score = ctx.topicScores?.[segmentId];
  return score !== undefined && score >= SEMANTIC_THRESHOLD;
}

function evaluatePolicy(
  policy: InjectionPolicy,
  segment: PromptSegment,
  ctx: AssemblyContext,
): boolean {
  switch (policy.type) {
    case "always":
      return true;

    case "every_n": {
      const lastTurn = ctx.lastIncludedAt[segment.id];
      if (lastTurn === undefined) return true;
      return ctx.turnNumber - lastTurn >= policy.n;
    }

    case "on_topic":
      return evaluateOnTopic(policy.keywords, segment.id, ctx);

    case "on_state_field": {
      const value = ctx.stateFields[policy.field];
      return value !== undefined && value.trim().length > 0;
    }

    case "custom":
      return policy.evaluate(ctx);
  }
}

// ---------------------------------------------------------------------------
// Segment sorting comparator
// ---------------------------------------------------------------------------

function compareSegments(a: PromptSegment, b: PromptSegment): number {
  const pa = PRIORITY_RANK[a.priority];
  const pb = PRIORITY_RANK[b.priority];
  if (pa !== pb) return pa - pb;
  return a.order - b.order;
}

// ---------------------------------------------------------------------------
// PromptAssembler
// ---------------------------------------------------------------------------

export class PromptAssembler {
  private segments: Map<string, PromptSegment> = new Map();

  /** Register a segment. Idempotent — re-registering updates the segment. */
  register(segment: PromptSegment): this {
    this.segments.set(segment.id, segment);
    return this;
  }

  /** Remove a segment by ID. */
  unregister(id: string): this {
    this.segments.delete(id);
    return this;
  }

  /** List all registered segments (for UI display). */
  listSegments(): PromptSegment[] {
    return [...this.segments.values()];
  }

  /** Assemble the prompt for a given context. */
  assemble(ctx: AssemblyContext): AssemblyResult {
    const eligible: PromptSegment[] = [];
    const ineligible: { id: string; reason: string }[] = [];

    for (const segment of this.segments.values()) {
      if (evaluatePolicy(segment.policy, segment, ctx)) {
        eligible.push(segment);
      } else {
        ineligible.push({ id: segment.id, reason: "policy not met" });
      }
    }

    eligible.sort(compareSegments);

    return this.buildResult(eligible, ineligible, ctx.tokenBudget);
  }

  private buildResult(
    eligible: PromptSegment[],
    ineligible: { id: string; reason: string }[],
    tokenBudget: number,
  ): AssemblyResult {
    const included: string[] = [];
    const omitted: { id: string; reason: string }[] = [...ineligible];
    const parts: string[] = [];
    let totalTokens = 0;

    for (const segment of eligible) {
      const wouldExceed = totalTokens + segment.tokenEstimate > tokenBudget;

      if (segment.priority === "critical") {
        // Critical segments are always included, even if over budget
        parts.push(segment.content);
        included.push(segment.id);
        totalTokens += segment.tokenEstimate;
      } else if (wouldExceed) {
        omitted.push({ id: segment.id, reason: "token budget exceeded" });
      } else {
        parts.push(segment.content);
        included.push(segment.id);
        totalTokens += segment.tokenEstimate;
      }
    }

    // Generate omitted-context note grouped by category
    const skippedByCategory = new Map<string, string[]>();
    for (const o of omitted) {
      const seg = this.segments.get(o.id);
      if (!seg) continue;
      const cat = seg.category;
      const list = skippedByCategory.get(cat);
      if (list) list.push(seg.label);
      else skippedByCategory.set(cat, [seg.label]);
    }

    if (skippedByCategory.size > 0) {
      const groups = [...skippedByCategory.entries()]
        .map(([cat, labels]) => `${cat}: ${labels.join(", ")}`)
        .join("; ");
      const note = `[Established context not injected this turn — ${groups}]`;
      parts.push(note);
      totalTokens += estimateTokens(note);
    }

    return {
      systemPrompt: parts.join("\n\n"),
      included,
      omitted,
      tokenEstimate: totalTokens,
    };
  }
}
