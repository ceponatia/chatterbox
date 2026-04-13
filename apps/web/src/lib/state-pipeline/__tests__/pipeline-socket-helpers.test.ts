/**
 * Tests for the pure helper functions exported from pipeline-socket.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SocketMessage, StatePipelineChange } from "@chatterbox/sockets";
import type { StructuredStoryState } from "@chatterbox/state-model";
import {
  splitCandidateFacts,
  processFactLifecycle,
  isThreadStale,
  resolveThreadUpdate,
  extractLastAssistantText,
  buildFreshnessReviewHint,
  buildRetryFeedback,
} from "../pipeline-socket.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function change(
  overrides: Partial<StatePipelineChange> = {},
): StatePipelineChange {
  return {
    type: "hard_fact",
    detail: "Alice is 28",
    confidence: 0.9,
    sourceTurn: 1,
    ...overrides,
  };
}

function msg(role: "user" | "assistant", content = "hello"): SocketMessage {
  return { id: `msg-${Math.random()}`, role, content };
}

function thread(
  overrides: Partial<StructuredStoryState["openThreads"][number]> = {},
): StructuredStoryState["openThreads"][number] {
  return {
    id: "t-1",
    description: "Alice and Bob tension",
    resolutionHint: "they reconcile",
    status: "active",
    createdAt: new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// splitCandidateFacts
// ---------------------------------------------------------------------------

describe("splitCandidateFacts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts all high-confidence changes into confirmed", () => {
    const changes = [change({ confidence: 0.9 }), change({ confidence: 0.8 })];
    const { confirmed, candidates } = splitCandidateFacts(changes, [
      msg("user"),
    ]);
    expect(confirmed).toHaveLength(2);
    expect(candidates).toHaveLength(0);
  });

  it("puts low-confidence fact changes into candidates", () => {
    const changes = [change({ confidence: 0.3 })];
    const { confirmed, candidates } = splitCandidateFacts(changes, [
      msg("user"),
    ]);
    expect(confirmed).toHaveLength(0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.content).toBe("Alice is 28");
    expect(candidates[0]!.confidence).toBe(0.3);
    expect(candidates[0]!.extractedAt).toBe("2026-03-15");
  });

  it("does not split non-fact change types regardless of confidence", () => {
    const changes = [
      change({ type: "relationship", confidence: 0.1 }),
      change({ type: "scene", confidence: 0.2 }),
    ];
    const { confirmed, candidates } = splitCandidateFacts(changes, [
      msg("user"),
    ]);
    expect(confirmed).toHaveLength(2);
    expect(candidates).toHaveLength(0);
  });

  it("splits mixed confidence and mixed types correctly", () => {
    const changes = [
      change({ type: "hard_fact", confidence: 0.9 }),
      change({ type: "hard_fact_new", confidence: 0.4 }),
      change({ type: "scene", confidence: 0.1 }),
      change({ type: "hard_fact_correction", confidence: 0.5 }),
    ];
    const { confirmed, candidates } = splitCandidateFacts(changes, [
      msg("user"),
    ]);
    expect(confirmed).toHaveLength(2); // high-confidence fact + scene
    expect(candidates).toHaveLength(2); // two low-confidence facts
  });

  it("returns empty arrays for empty input", () => {
    const { confirmed, candidates } = splitCandidateFacts([], [msg("user")]);
    expect(confirmed).toHaveLength(0);
    expect(candidates).toHaveLength(0);
  });

  it("treats confidence exactly at 0.6 as confirmed", () => {
    const changes = [change({ confidence: 0.6 })];
    const { confirmed, candidates } = splitCandidateFacts(changes, [
      msg("user"),
    ]);
    expect(confirmed).toHaveLength(1);
    expect(candidates).toHaveLength(0);
  });

  it("treats confidence at 0.59 as candidate", () => {
    const changes = [change({ confidence: 0.59 })];
    const { confirmed, candidates } = splitCandidateFacts(changes, [
      msg("user"),
    ]);
    expect(confirmed).toHaveLength(0);
    expect(candidates).toHaveLength(1);
  });

  it("recognizes all fact change types", () => {
    const types = [
      "hard_fact",
      "hard_fact_new",
      "hard_fact_superseded",
      "hard_fact_correction",
      "new_hard_fact",
      "some_fact_type", // contains "fact"
    ];
    for (const type of types) {
      const { candidates } = splitCandidateFacts(
        [change({ type, confidence: 0.1 })],
        [msg("user")],
      );
      expect(candidates).toHaveLength(1);
    }
  });

  it("assigns sourceMessageId from last message", () => {
    const messages = [
      { id: "msg-1", role: "user" as const, content: "hi" },
      { id: "msg-2", role: "assistant" as const, content: "hello" },
    ];
    const { candidates } = splitCandidateFacts(
      [change({ confidence: 0.3 })],
      messages,
    );
    expect(candidates[0]!.sourceMessageId).toBe("msg-2");
  });

  it("uses 'unknown' sourceMessageId when no messages", () => {
    const { candidates } = splitCandidateFacts(
      [change({ confidence: 0.3 })],
      [],
    );
    expect(candidates[0]!.sourceMessageId).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// processFactLifecycle
// ---------------------------------------------------------------------------

describe("processFactLifecycle", () => {
  it("confirms a fact when its text appears in recent text", () => {
    const state: Pick<StructuredStoryState, "hardFacts"> = {
      hardFacts: [{ fact: "Alice is 28", superseded: false }],
    };
    processFactLifecycle(
      state as StructuredStoryState,
      [],
      "alice is 28 years old",
      [],
      "2026-03-15",
    );
    expect(state.hardFacts[0]!.lastConfirmedAt).toBe("2026-03-15");
    expect(state.hardFacts[0]!.superseded).toBe(false);
  });

  it("confirms a fact when it appears in recent fact changes", () => {
    const state: Pick<StructuredStoryState, "hardFacts"> = {
      hardFacts: [{ fact: "Alice is 28", superseded: false }],
    };
    processFactLifecycle(
      state as StructuredStoryState,
      [],
      "",
      [change({ detail: "Alice is 28 years old" })],
      "2026-03-15",
    );
    expect(state.hardFacts[0]!.lastConfirmedAt).toBe("2026-03-15");
  });

  it("attaches supersededBy when a superseded fact matches a change", () => {
    const state: Pick<StructuredStoryState, "hardFacts"> = {
      hardFacts: [{ fact: "Alice is 28", superseded: true }],
    };
    processFactLifecycle(
      state as StructuredStoryState,
      [
        change({
          type: "hard_fact_superseded",
          detail: "Alice is 28 -> Alice is 29",
        }),
      ],
      "",
      [],
      "2026-03-15",
    );
    expect(state.hardFacts[0]!.supersededBy).toBe("Alice is 28 -> Alice is 29");
  });

  it("leaves facts unchanged when no match or confirmation", () => {
    const original = { fact: "Bob is tall", superseded: false };
    const state: Pick<StructuredStoryState, "hardFacts"> = {
      hardFacts: [{ ...original }],
    };
    processFactLifecycle(
      state as StructuredStoryState,
      [],
      "something unrelated",
      [],
      "2026-03-15",
    );
    expect(state.hardFacts[0]!.lastConfirmedAt).toBeUndefined();
    expect(state.hardFacts[0]!.superseded).toBe(false);
  });

  it("handles empty facts array", () => {
    const state: Pick<StructuredStoryState, "hardFacts"> = {
      hardFacts: [],
    };
    processFactLifecycle(
      state as StructuredStoryState,
      [],
      "some text",
      [],
      "2026-03-15",
    );
    expect(state.hardFacts).toHaveLength(0);
  });

  it("handles empty recent text", () => {
    const state: Pick<StructuredStoryState, "hardFacts"> = {
      hardFacts: [{ fact: "Alice is 28", superseded: false }],
    };
    processFactLifecycle(
      state as StructuredStoryState,
      [],
      "",
      [],
      "2026-03-15",
    );
    expect(state.hardFacts[0]!.lastConfirmedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isThreadStale
// ---------------------------------------------------------------------------

describe("isThreadStale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when referenced", () => {
    const t = thread({ createdAt: "2025-01-01" });
    expect(isThreadStale(t, true, undefined, undefined)).toBe(false);
  });

  it("returns false when resolvedChange is present", () => {
    const t = thread({ createdAt: "2025-01-01" });
    expect(isThreadStale(t, false, change(), undefined)).toBe(false);
  });

  it("returns false when evolved is present", () => {
    const t = thread({ createdAt: "2025-01-01" });
    expect(isThreadStale(t, false, undefined, change())).toBe(false);
  });

  it("returns true when 31+ days old and not referenced", () => {
    const t = thread({ createdAt: "2026-02-28" }); // >30 days before Apr 1
    expect(isThreadStale(t, false, undefined, undefined)).toBe(true);
  });

  it("returns false when 29 days old", () => {
    const t = thread({ createdAt: "2026-03-03" }); // 29 days before Apr 1
    expect(isThreadStale(t, false, undefined, undefined)).toBe(false);
  });

  it("uses lastReferencedAt over createdAt when available", () => {
    const t = thread({
      createdAt: "2025-01-01",
      lastReferencedAt: "2026-03-31",
    });
    expect(isThreadStale(t, false, undefined, undefined)).toBe(false);
  });

  it("handles thread with no dates (returns false - Infinity check)", () => {
    const t = thread({ createdAt: undefined });
    // toDay returns Infinity for undefined, so Date.now() - Infinity < threshold
    expect(isThreadStale(t, false, undefined, undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveThreadUpdate
// ---------------------------------------------------------------------------

describe("resolveThreadUpdate", () => {
  it("marks thread as resolved when thread_resolved change matches", () => {
    const t = thread({ description: "Alice and Bob tension" });
    const changes = [
      change({
        type: "thread_resolved",
        detail: "alice and bob tension is over",
      }),
    ];
    const result = resolveThreadUpdate(t, changes, "", "2026-03-15");
    expect(result.status).toBe("resolved");
    expect(result.closureRationale).toBe("alice and bob tension is over");
  });

  it("marks thread as evolved when thread_evolved change matches", () => {
    const t = thread({ description: "Alice and Bob tension" });
    const changes = [
      change({
        type: "thread_evolved",
        detail: "alice and bob tension -> alice and bob alliance",
      }),
    ];
    const result = resolveThreadUpdate(t, changes, "", "2026-03-15");
    expect(result.status).toBe("evolved");
    expect(result.evolvedInto).toBe("alice and bob alliance");
  });

  it("marks thread as stale when old and unreferenced", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
    const t = thread({
      description: "Old thread about aliens",
      createdAt: "2026-01-01",
    });
    const result = resolveThreadUpdate(
      t,
      [],
      "something else entirely",
      "2026-04-01",
    );
    expect(result.status).toBe("stale");
    expect(result.closureRationale).toContain("stale");
    vi.useRealTimers();
  });

  it("updates lastReferencedAt when thread is referenced in recent text", () => {
    const t = thread({ description: "Alice and Bob tension" });
    const result = resolveThreadUpdate(
      t,
      [],
      "alice and bob tension continues",
      "2026-03-15",
    );
    expect(result.lastReferencedAt).toBe("2026-03-15");
  });

  it("retains status when no changes and not stale", () => {
    const t = thread({
      description: "Recent thread",
      createdAt: new Date().toISOString().slice(0, 10),
      status: "active",
    });
    const result = resolveThreadUpdate(t, [], "unrelated text", "2026-03-15");
    expect(result.status).toBe("active");
  });

  it("prefers resolved over evolved when both present", () => {
    const t = thread({ description: "Alice and Bob tension" });
    const changes = [
      change({
        type: "thread_resolved",
        detail: "alice and bob tension resolved",
      }),
      change({
        type: "thread_evolved",
        detail: "alice and bob tension -> new thread",
      }),
    ];
    const result = resolveThreadUpdate(t, changes, "", "2026-03-15");
    expect(result.status).toBe("resolved");
  });
});

// ---------------------------------------------------------------------------
// extractLastAssistantText
// ---------------------------------------------------------------------------

describe("extractLastAssistantText", () => {
  it("returns the last assistant message content", () => {
    const messages: SocketMessage[] = [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" },
      { id: "3", role: "user", content: "how are you" },
      { id: "4", role: "assistant", content: "fine thanks" },
    ];
    expect(extractLastAssistantText(messages)).toBe("fine thanks");
  });

  it("returns empty string for empty array", () => {
    expect(extractLastAssistantText([])).toBe("");
  });

  it("returns empty string when no assistant messages", () => {
    const messages: SocketMessage[] = [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "user", content: "hello" },
    ];
    expect(extractLastAssistantText(messages)).toBe("");
  });

  it("returns the only assistant message when it is the sole element", () => {
    const messages: SocketMessage[] = [
      { id: "1", role: "assistant", content: "only one" },
    ];
    expect(extractLastAssistantText(messages)).toBe("only one");
  });
});

// ---------------------------------------------------------------------------
// buildFreshnessReviewHint
// ---------------------------------------------------------------------------

describe("buildFreshnessReviewHint", () => {
  it("returns empty string when no stale sections", () => {
    expect(buildFreshnessReviewHint()).toBe("");
    expect(buildFreshnessReviewHint([])).toBe("");
  });

  it("returns a hint with listed sections", () => {
    const result = buildFreshnessReviewHint(["Relationships", "Hard Facts"]);
    expect(result).toContain("Relationships");
    expect(result).toContain("Hard Facts");
    expect(result).toContain("Section freshness review");
  });

  it("includes each section as a bullet point", () => {
    const result = buildFreshnessReviewHint(["Cast", "Scene"]);
    expect(result).toContain("- Cast");
    expect(result).toContain("- Scene");
  });
});

// ---------------------------------------------------------------------------
// buildRetryFeedback
// ---------------------------------------------------------------------------

describe("buildRetryFeedback", () => {
  it("returns empty string when all validations pass", () => {
    const result = buildRetryFeedback({
      schemaValid: true,
      outputComplete: true,
      noUnknownFacts: true,
      diffPercentage: 10,
    });
    expect(result).toBe("");
  });

  it("includes schema failure message", () => {
    const result = buildRetryFeedback({
      schemaValid: false,
      outputComplete: true,
      noUnknownFacts: true,
      diffPercentage: 10,
    });
    expect(result).toContain("required sections");
  });

  it("includes output incomplete message", () => {
    const result = buildRetryFeedback({
      schemaValid: true,
      outputComplete: false,
      noUnknownFacts: true,
      diffPercentage: 10,
    });
    expect(result).toContain("truncated or incomplete");
  });

  it("includes unknown facts message", () => {
    const result = buildRetryFeedback({
      schemaValid: true,
      outputComplete: true,
      noUnknownFacts: false,
      diffPercentage: 10,
    });
    expect(result).toContain("not grounded");
  });

  it("includes diff percentage when over 50%", () => {
    const result = buildRetryFeedback({
      schemaValid: true,
      outputComplete: true,
      noUnknownFacts: true,
      diffPercentage: 75,
    });
    expect(result).toContain("75%");
    expect(result).toContain("too much");
  });

  it("does not include diff message when exactly 50%", () => {
    const result = buildRetryFeedback({
      schemaValid: true,
      outputComplete: true,
      noUnknownFacts: true,
      diffPercentage: 50,
    });
    expect(result).toBe("");
  });

  it("includes all failure messages when everything fails", () => {
    const result = buildRetryFeedback({
      schemaValid: false,
      outputComplete: false,
      noUnknownFacts: false,
      diffPercentage: 80,
    });
    expect(result).toContain("required sections");
    expect(result).toContain("truncated or incomplete");
    expect(result).toContain("not grounded");
    expect(result).toContain("80%");
    expect(result).toContain("Retry feedback");
  });
});
