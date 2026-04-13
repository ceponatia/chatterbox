import { describe, it, expect } from "vitest";
import { segmentedPromptAssembly } from "../socket-adapter";
import type { AssemblyContext } from "../types";

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

describe("segmentedPromptAssembly", () => {
  it("returns an AssemblyResult with expected shape", () => {
    const result = segmentedPromptAssembly.assemble("", "", makeContext());
    expect(result).toHaveProperty("systemPrompt");
    expect(result).toHaveProperty("included");
    expect(result).toHaveProperty("omitted");
    expect(result).toHaveProperty("tokenEstimate");
  });

  it("ignores systemPrompt and storyState parameters", () => {
    const result1 = segmentedPromptAssembly.assemble(
      "custom system prompt",
      "custom story state",
      makeContext(),
    );
    const result2 = segmentedPromptAssembly.assemble(
      "different prompt",
      "different state",
      makeContext(),
    );
    // Both calls should produce the same result since params are ignored
    expect(result1.included).toEqual(result2.included);
    expect(result1.systemPrompt).toEqual(result2.systemPrompt);
  });

  it("result included array contains segment IDs", () => {
    const result = segmentedPromptAssembly.assemble("", "", makeContext());
    expect(result.included.length).toBeGreaterThan(0);
    // All IDs should be strings
    for (const id of result.included) {
      expect(typeof id).toBe("string");
    }
  });

  it("result tokenEstimate is a positive number", () => {
    const result = segmentedPromptAssembly.assemble("", "", makeContext());
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it("different turnNumbers affect which segments are included", () => {
    // On turn 1, all every_n segments fire (first turn, no lastIncludedAt)
    const resultTurn1 = segmentedPromptAssembly.assemble(
      "",
      "",
      makeContext({ turnNumber: 1 }),
    );

    // On turn 2 with all segments last included at turn 1,
    // every_n(2) and every_n(3) should NOT fire
    const lastIncludedAt: Record<string, number> = {};
    for (const id of resultTurn1.included) {
      lastIncludedAt[id] = 1;
    }

    const resultTurn2 = segmentedPromptAssembly.assemble(
      "",
      "",
      makeContext({ turnNumber: 2, lastIncludedAt }),
    );

    // Turn 2 should have fewer or equal segments since every_n policies block
    expect(resultTurn2.included.length).toBeLessThanOrEqual(
      resultTurn1.included.length,
    );
  });

  it("always-policy segments are included on every turn", () => {
    const result = segmentedPromptAssembly.assemble("", "", makeContext());
    // core_rules has always policy + critical priority
    expect(result.included).toContain("core_rules");
  });
});
