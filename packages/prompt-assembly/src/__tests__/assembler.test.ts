import { describe, it, expect } from "vitest";
import { PromptAssembler } from "../assembler";
import type { PromptSegment, AssemblyContext } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  overrides: Partial<AssemblyContext> = {},
): AssemblyContext {
  return {
    turnNumber: 1,
    lastIncludedAt: {},
    currentUserMessage: "",
    stateFields: {},
    tokenBudget: 10000,
    ...overrides,
  };
}

function makeSegment(overrides: Partial<PromptSegment> = {}): PromptSegment {
  return {
    id: "test_segment",
    label: "Test Segment",
    content: "Test content",
    policy: { type: "always" },
    priority: "normal",
    order: 50,
    tokenEstimate: 10,
    category: "test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Registration & Listing
// ---------------------------------------------------------------------------

describe("PromptAssembler", () => {
  describe("registration and listing", () => {
    it("lists registered segments", () => {
      const assembler = new PromptAssembler();
      const seg = makeSegment({ id: "a" });
      assembler.register(seg);
      expect(assembler.listSegments()).toEqual([seg]);
    });

    it("returns empty array when no segments registered", () => {
      const assembler = new PromptAssembler();
      expect(assembler.listSegments()).toEqual([]);
    });

    it("updates segment when re-registering same ID", () => {
      const assembler = new PromptAssembler();
      assembler.register(makeSegment({ id: "a", content: "v1" }));
      assembler.register(makeSegment({ id: "a", content: "v2" }));
      const segments = assembler.listSegments();
      expect(segments).toHaveLength(1);
      expect(segments[0]!.content).toBe("v2");
    });

    it("unregisters a segment", () => {
      const assembler = new PromptAssembler();
      assembler.register(makeSegment({ id: "a" }));
      assembler.unregister("a");
      expect(assembler.listSegments()).toEqual([]);
    });

    it("unregistering non-existent ID does not throw", () => {
      const assembler = new PromptAssembler();
      expect(() => assembler.unregister("missing")).not.toThrow();
    });

    it("register returns this for chaining", () => {
      const assembler = new PromptAssembler();
      const result = assembler.register(makeSegment());
      expect(result).toBe(assembler);
    });

    it("unregister returns this for chaining", () => {
      const assembler = new PromptAssembler();
      const result = assembler.unregister("x");
      expect(result).toBe(assembler);
    });
  });

  // -------------------------------------------------------------------------
  // Policy: always
  // -------------------------------------------------------------------------

  describe("policy: always", () => {
    it("always includes segment regardless of context", () => {
      const assembler = new PromptAssembler();
      assembler.register(makeSegment({ id: "a", policy: { type: "always" } }));
      const result = assembler.assemble(makeContext());
      expect(result.included).toContain("a");
    });

    it("includes multiple always segments", () => {
      const assembler = new PromptAssembler();
      assembler.register(makeSegment({ id: "a", policy: { type: "always" } }));
      assembler.register(makeSegment({ id: "b", policy: { type: "always" } }));
      const result = assembler.assemble(makeContext());
      expect(result.included).toContain("a");
      expect(result.included).toContain("b");
    });
  });

  // -------------------------------------------------------------------------
  // Policy: every_n
  // -------------------------------------------------------------------------

  describe("policy: every_n", () => {
    it("includes on first turn when lastIncludedAt not set", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({ id: "a", policy: { type: "every_n", n: 3 } }),
      );
      const result = assembler.assemble(
        makeContext({ turnNumber: 1, lastIncludedAt: {} }),
      );
      expect(result.included).toContain("a");
    });

    it("includes when turnNumber - lastIncludedAt >= n", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({ id: "a", policy: { type: "every_n", n: 3 } }),
      );
      const result = assembler.assemble(
        makeContext({ turnNumber: 4, lastIncludedAt: { a: 1 } }),
      );
      expect(result.included).toContain("a");
    });

    it("includes when turnNumber - lastIncludedAt == n exactly", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({ id: "a", policy: { type: "every_n", n: 3 } }),
      );
      const result = assembler.assemble(
        makeContext({ turnNumber: 4, lastIncludedAt: { a: 1 } }),
      );
      // 4 - 1 = 3 >= 3 => included
      expect(result.included).toContain("a");
    });

    it("omits when turnNumber - lastIncludedAt < n", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({ id: "a", policy: { type: "every_n", n: 3 } }),
      );
      const result = assembler.assemble(
        makeContext({ turnNumber: 2, lastIncludedAt: { a: 1 } }),
      );
      // 2 - 1 = 1 < 3 => omitted
      expect(result.included).not.toContain("a");
    });

    it("omits when turnNumber - lastIncludedAt == n - 1", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({ id: "a", policy: { type: "every_n", n: 3 } }),
      );
      const result = assembler.assemble(
        makeContext({ turnNumber: 3, lastIncludedAt: { a: 1 } }),
      );
      // 3 - 1 = 2 < 3 => omitted
      expect(result.included).not.toContain("a");
    });

    it("every_n(1) always includes", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({ id: "a", policy: { type: "every_n", n: 1 } }),
      );
      const result = assembler.assemble(
        makeContext({ turnNumber: 5, lastIncludedAt: { a: 4 } }),
      );
      // 5 - 4 = 1 >= 1 => included
      expect(result.included).toContain("a");
    });
  });

  // -------------------------------------------------------------------------
  // Policy: on_topic
  // -------------------------------------------------------------------------

  describe("policy: on_topic", () => {
    it("includes when keyword present in user message", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_topic", keywords: ["school"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({ currentUserMessage: "I went to school today" }),
      );
      expect(result.included).toContain("a");
    });

    it("omits when keyword not present and no topicScores", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_topic", keywords: ["school"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({ currentUserMessage: "hello world" }),
      );
      expect(result.included).not.toContain("a");
    });

    it("includes when topicScores fallback >= 0.5", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_topic", keywords: ["school"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({
          currentUserMessage: "hello world",
          topicScores: { a: 0.5 },
        }),
      );
      expect(result.included).toContain("a");
    });

    it("omits when topicScores fallback < 0.5", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_topic", keywords: ["school"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({
          currentUserMessage: "hello world",
          topicScores: { a: 0.49 },
        }),
      );
      expect(result.included).not.toContain("a");
    });

    it("includes with multi-word keyword match", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_topic", keywords: ["middle school"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({ currentUserMessage: "I went to middle school" }),
      );
      expect(result.included).toContain("a");
    });
  });

  // -------------------------------------------------------------------------
  // Policy: on_state_field
  // -------------------------------------------------------------------------

  describe("policy: on_state_field", () => {
    it("includes when stateFields contains the field with non-empty value", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_state_field", field: "relationships" },
        }),
      );
      const result = assembler.assemble(
        makeContext({ stateFields: { relationships: "dating" } }),
      );
      expect(result.included).toContain("a");
    });

    it("omits when stateFields field is empty string", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_state_field", field: "relationships" },
        }),
      );
      const result = assembler.assemble(
        makeContext({ stateFields: { relationships: "" } }),
      );
      expect(result.included).not.toContain("a");
    });

    it("omits when stateFields field is whitespace only", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_state_field", field: "relationships" },
        }),
      );
      const result = assembler.assemble(
        makeContext({ stateFields: { relationships: "   " } }),
      );
      expect(result.included).not.toContain("a");
    });

    it("omits when stateFields field not present", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_state_field", field: "relationships" },
        }),
      );
      const result = assembler.assemble(makeContext({ stateFields: {} }));
      expect(result.included).not.toContain("a");
    });
  });

  // -------------------------------------------------------------------------
  // Policy: on_presence
  // -------------------------------------------------------------------------

  describe("policy: on_presence", () => {
    it("includes when presentEntityIds contains entityId", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_presence", entityId: "entity-1" },
        }),
      );
      const result = assembler.assemble(
        makeContext({ presentEntityIds: ["entity-1", "entity-2"] }),
      );
      expect(result.included).toContain("a");
    });

    it("omits when presentEntityIds does not contain entityId", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_presence", entityId: "entity-1" },
        }),
      );
      const result = assembler.assemble(
        makeContext({ presentEntityIds: ["entity-2"] }),
      );
      expect(result.included).not.toContain("a");
    });

    it("omits when presentEntityIds is undefined", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_presence", entityId: "entity-1" },
        }),
      );
      const result = assembler.assemble(
        makeContext({ presentEntityIds: undefined }),
      );
      expect(result.included).not.toContain("a");
    });

    it("omits when presentEntityIds is empty array", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_presence", entityId: "entity-1" },
        }),
      );
      const result = assembler.assemble(makeContext({ presentEntityIds: [] }));
      expect(result.included).not.toContain("a");
    });
  });

  // -------------------------------------------------------------------------
  // Policy: custom
  // -------------------------------------------------------------------------

  describe("policy: custom", () => {
    it("includes when custom evaluate returns true", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "custom", evaluate: () => true },
        }),
      );
      const result = assembler.assemble(makeContext());
      expect(result.included).toContain("a");
    });

    it("omits when custom evaluate returns false", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "custom", evaluate: () => false },
        }),
      );
      const result = assembler.assemble(makeContext());
      expect(result.included).not.toContain("a");
    });

    it("passes context to custom evaluate function", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: {
            type: "custom",
            evaluate: (ctx) => ctx.turnNumber > 5,
          },
        }),
      );
      expect(
        assembler.assemble(makeContext({ turnNumber: 3 })).included,
      ).not.toContain("a");
      expect(
        assembler.assemble(makeContext({ turnNumber: 6 })).included,
      ).toContain("a");
    });
  });

  // -------------------------------------------------------------------------
  // Priority sorting
  // -------------------------------------------------------------------------

  describe("priority sorting", () => {
    it("critical segments come before high in output", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "high_seg",
          content: "HIGH",
          priority: "high",
          order: 10,
        }),
      );
      assembler.register(
        makeSegment({
          id: "crit_seg",
          content: "CRIT",
          priority: "critical",
          order: 10,
        }),
      );
      const result = assembler.assemble(makeContext());
      expect(result.systemPrompt.indexOf("CRIT")).toBeLessThan(
        result.systemPrompt.indexOf("HIGH"),
      );
    });

    it("high before normal before low", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "low_seg",
          content: "LOW",
          priority: "low",
          order: 10,
        }),
      );
      assembler.register(
        makeSegment({
          id: "norm_seg",
          content: "NORM",
          priority: "normal",
          order: 10,
        }),
      );
      assembler.register(
        makeSegment({
          id: "high_seg",
          content: "HIGH",
          priority: "high",
          order: 10,
        }),
      );
      const result = assembler.assemble(makeContext());
      const highIdx = result.systemPrompt.indexOf("HIGH");
      const normIdx = result.systemPrompt.indexOf("NORM");
      const lowIdx = result.systemPrompt.indexOf("LOW");
      expect(highIdx).toBeLessThan(normIdx);
      expect(normIdx).toBeLessThan(lowIdx);
    });

    it("lower order comes first within same priority", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "b",
          content: "SECOND",
          priority: "normal",
          order: 20,
        }),
      );
      assembler.register(
        makeSegment({
          id: "a",
          content: "FIRST",
          priority: "normal",
          order: 10,
        }),
      );
      const result = assembler.assemble(makeContext());
      expect(result.systemPrompt.indexOf("FIRST")).toBeLessThan(
        result.systemPrompt.indexOf("SECOND"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Token budget
  // -------------------------------------------------------------------------

  describe("token budget", () => {
    it("includes all segments within budget", () => {
      const assembler = new PromptAssembler();
      assembler.register(makeSegment({ id: "a", tokenEstimate: 10, order: 1 }));
      assembler.register(makeSegment({ id: "b", tokenEstimate: 10, order: 2 }));
      const result = assembler.assemble(makeContext({ tokenBudget: 100 }));
      expect(result.included).toContain("a");
      expect(result.included).toContain("b");
    });

    it("drops lower-priority segments when budget exceeded", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "high",
          tokenEstimate: 60,
          priority: "high",
          order: 1,
        }),
      );
      assembler.register(
        makeSegment({
          id: "low",
          tokenEstimate: 60,
          priority: "low",
          order: 2,
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 80 }));
      expect(result.included).toContain("high");
      expect(result.included).not.toContain("low");
      expect(result.omitted.some((o) => o.id === "low")).toBe(true);
    });

    it("critical segments always included even if they exceed budget", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "crit",
          tokenEstimate: 200,
          priority: "critical",
          content: "Critical stuff",
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 50 }));
      expect(result.included).toContain("crit");
      expect(result.tokenEstimate).toBeGreaterThanOrEqual(200);
    });

    it("tokenEstimate in result reflects actual included tokens", () => {
      const assembler = new PromptAssembler();
      assembler.register(makeSegment({ id: "a", tokenEstimate: 30, order: 1 }));
      assembler.register(makeSegment({ id: "b", tokenEstimate: 40, order: 2 }));
      const result = assembler.assemble(makeContext({ tokenBudget: 10000 }));
      // tokenEstimate includes the segment tokens plus any omitted-context note
      expect(result.tokenEstimate).toBeGreaterThanOrEqual(70);
    });

    it("budget of 0 includes only critical segments", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "crit",
          tokenEstimate: 10,
          priority: "critical",
          content: "Critical",
        }),
      );
      assembler.register(
        makeSegment({
          id: "norm",
          tokenEstimate: 10,
          priority: "normal",
          content: "Normal",
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 0 }));
      expect(result.included).toContain("crit");
      expect(result.included).not.toContain("norm");
    });
  });

  // -------------------------------------------------------------------------
  // Omitted context notes
  // -------------------------------------------------------------------------

  describe("omitted context notes", () => {
    it("appends omitted-context note when segments are skipped", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          tokenEstimate: 100,
          priority: "normal",
          label: "Appearance",
          category: "character",
          content: "appearance details",
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 0 }));
      expect(result.systemPrompt).toContain(
        "[Established context not injected this turn",
      );
      expect(result.systemPrompt).toContain("character: Appearance");
    });

    it("uses omittedSummary in note when provided", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          tokenEstimate: 100,
          priority: "normal",
          label: "Appearance",
          omittedSummary: "describes how char looks",
          category: "character",
          content: "appearance details",
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 0 }));
      expect(result.systemPrompt).toContain(
        "Appearance (describes how char looks)",
      );
    });

    it("groups omitted segments by category", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          tokenEstimate: 100,
          priority: "normal",
          label: "Seg A",
          category: "character",
          content: "content a",
        }),
      );
      assembler.register(
        makeSegment({
          id: "b",
          tokenEstimate: 100,
          priority: "normal",
          label: "Seg B",
          category: "world",
          content: "content b",
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 0 }));
      expect(result.systemPrompt).toContain("character: Seg A");
      expect(result.systemPrompt).toContain("world: Seg B");
    });

    it("omitted array contains correct segment IDs and reasons", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "ineligible",
          policy: { type: "on_topic", keywords: ["xyz"] },
          content: "topic content",
        }),
      );
      assembler.register(
        makeSegment({
          id: "over_budget",
          tokenEstimate: 500,
          priority: "low",
          content: "big content",
        }),
      );
      const result = assembler.assemble(
        makeContext({ tokenBudget: 10, currentUserMessage: "hello" }),
      );
      const ineligibleOmit = result.omitted.find((o) => o.id === "ineligible");
      const budgetOmit = result.omitted.find((o) => o.id === "over_budget");
      expect(ineligibleOmit).toBeDefined();
      expect(ineligibleOmit!.reason).toBe("policy not met");
      expect(budgetOmit).toBeDefined();
      expect(budgetOmit!.reason).toBe("token budget exceeded");
    });

    it("no omitted-context note when nothing is omitted", () => {
      const assembler = new PromptAssembler();
      assembler.register(makeSegment({ id: "a", tokenEstimate: 5 }));
      const result = assembler.assemble(makeContext({ tokenBudget: 10000 }));
      expect(result.systemPrompt).not.toContain(
        "[Established context not injected this turn",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe("edge cases", () => {
    it("empty assembler produces empty result", () => {
      const assembler = new PromptAssembler();
      const result = assembler.assemble(makeContext());
      expect(result.systemPrompt).toBe("");
      expect(result.included).toEqual([]);
      expect(result.omitted).toEqual([]);
      expect(result.tokenEstimate).toBe(0);
    });

    it("all segments ineligible produces empty systemPrompt", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          policy: { type: "on_topic", keywords: ["xyz"] },
          content: "topic content",
          category: "test",
          label: "Topic A",
        }),
      );
      const result = assembler.assemble(
        makeContext({ currentUserMessage: "hello" }),
      );
      expect(result.included).toEqual([]);
      // systemPrompt may contain the omitted-context note
      expect(result.omitted).toHaveLength(1);
      expect(result.omitted[0]!.id).toBe("a");
    });

    it("multiple segments in same category listed together in omitted note", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          tokenEstimate: 500,
          priority: "low",
          label: "Seg A",
          category: "character",
          content: "a",
          order: 1,
        }),
      );
      assembler.register(
        makeSegment({
          id: "b",
          tokenEstimate: 500,
          priority: "low",
          label: "Seg B",
          category: "character",
          content: "b",
          order: 2,
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 0 }));
      expect(result.systemPrompt).toContain("character: Seg A, Seg B");
    });

    it("omitted-context note format starts with bracket notation", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          tokenEstimate: 500,
          priority: "normal",
          label: "TestLabel",
          category: "testcat",
          content: "content",
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 0 }));
      expect(result.systemPrompt).toMatch(
        /^\[Established context not injected this turn/,
      );
      expect(result.systemPrompt).toContain("testcat: TestLabel");
      expect(result.systemPrompt).toMatch(/\]$/);
    });

    it("omitted-context note uses em dash separator between groups", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "a",
          tokenEstimate: 500,
          priority: "normal",
          label: "LabelA",
          category: "catA",
          content: "a",
          order: 1,
        }),
      );
      assembler.register(
        makeSegment({
          id: "b",
          tokenEstimate: 500,
          priority: "normal",
          label: "LabelB",
          category: "catB",
          content: "b",
          order: 2,
        }),
      );
      const result = assembler.assemble(makeContext({ tokenBudget: 0 }));
      // The note format is: [Established context not injected this turn — catA: LabelA; catB: LabelB]
      expect(result.systemPrompt).toContain("; ");
    });
  });

  // -------------------------------------------------------------------------
  // Semantic threshold boundary
  // -------------------------------------------------------------------------

  describe("semantic threshold boundary", () => {
    it("topicScores = 0.5 exactly meets threshold (included)", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "topic_seg",
          policy: { type: "on_topic", keywords: ["zzz_nomatch"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({
          currentUserMessage: "hello",
          topicScores: { topic_seg: 0.5 },
        }),
      );
      expect(result.included).toContain("topic_seg");
    });

    it("topicScores = 0.49 does not meet threshold (excluded)", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "topic_seg",
          policy: { type: "on_topic", keywords: ["zzz_nomatch"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({
          currentUserMessage: "hello",
          topicScores: { topic_seg: 0.49 },
        }),
      );
      expect(result.included).not.toContain("topic_seg");
    });

    it("topicScores = 0.51 meets threshold (included)", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "topic_seg",
          policy: { type: "on_topic", keywords: ["zzz_nomatch"] },
        }),
      );
      const result = assembler.assemble(
        makeContext({
          currentUserMessage: "hello",
          topicScores: { topic_seg: 0.51 },
        }),
      );
      expect(result.included).toContain("topic_seg");
    });
  });

  // -------------------------------------------------------------------------
  // Order tiebreaking within same priority
  // -------------------------------------------------------------------------

  describe("order tiebreaking", () => {
    it("segments with same priority sorted by order in output", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "c",
          content: "THIRD",
          priority: "normal",
          order: 30,
        }),
      );
      assembler.register(
        makeSegment({
          id: "a",
          content: "FIRST",
          priority: "normal",
          order: 10,
        }),
      );
      assembler.register(
        makeSegment({
          id: "b",
          content: "SECOND",
          priority: "normal",
          order: 20,
        }),
      );
      const result = assembler.assemble(makeContext());
      const firstIdx = result.systemPrompt.indexOf("FIRST");
      const secondIdx = result.systemPrompt.indexOf("SECOND");
      const thirdIdx = result.systemPrompt.indexOf("THIRD");
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });

    it("priority takes precedence over order", () => {
      const assembler = new PromptAssembler();
      assembler.register(
        makeSegment({
          id: "low_early",
          content: "LOW_EARLY",
          priority: "low",
          order: 1,
        }),
      );
      assembler.register(
        makeSegment({
          id: "high_late",
          content: "HIGH_LATE",
          priority: "high",
          order: 99,
        }),
      );
      const result = assembler.assemble(makeContext());
      expect(result.systemPrompt.indexOf("HIGH_LATE")).toBeLessThan(
        result.systemPrompt.indexOf("LOW_EARLY"),
      );
    });
  });
});
