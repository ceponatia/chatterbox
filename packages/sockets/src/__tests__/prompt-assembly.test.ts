import { describe, it, expect } from "vitest";
import { defaultPromptAssembly } from "../prompt-assembly";
import type { AssemblyContext } from "../types";

const TOKEN_BOUNDARY_CASES = [
  { length: 3, expectedTokens: 1 },
  { length: 4, expectedTokens: 1 },
  { length: 5, expectedTokens: 2 },
  { length: 8, expectedTokens: 2 },
  { length: 9, expectedTokens: 3 },
  { length: 10, expectedTokens: 3 },
] as const;

const CTX: AssemblyContext = {
  turnNumber: 1,
  currentUserMessage: "",
  lastIncludedAt: {},
  stateFields: {},
  tokenBudget: 2500,
};

describe("defaultPromptAssembly", () => {
  it("returns systemPrompt alone when storyState is empty string", () => {
    const result = defaultPromptAssembly.assemble("Hello world", "", CTX);
    expect(result.systemPrompt).toBe("Hello world");
  });

  it("concatenates with story state header when storyState is provided", () => {
    const result = defaultPromptAssembly.assemble("Prompt", "Some state", CTX);
    expect(result.systemPrompt).toBe(
      "Prompt\n\n## Current Story State\nSome state",
    );
  });

  it("included is always ['monolithic']", () => {
    const result = defaultPromptAssembly.assemble("P", "S", CTX);
    expect(result.included).toEqual(["monolithic"]);
  });

  it("omitted is always empty", () => {
    const result = defaultPromptAssembly.assemble("P", "S", CTX);
    expect(result.omitted).toEqual([]);
  });

  it("tokenEstimate is Math.ceil(assembled.length / 4)", () => {
    const result = defaultPromptAssembly.assemble("Hello", "", CTX);
    expect(result.tokenEstimate).toBe(Math.ceil("Hello".length / 4));
  });

  it.each(TOKEN_BOUNDARY_CASES)(
    "estimates $expectedTokens token(s) for system prompt length $length",
    ({ length, expectedTokens }) => {
      const systemPrompt = "A".repeat(length);
      const result = defaultPromptAssembly.assemble(systemPrompt, "", CTX);
      expect(result.tokenEstimate).toBe(expectedTokens);
    },
  );

  it("estimates tokens for long prompt", () => {
    const longPrompt = "A".repeat(1000);
    const result = defaultPromptAssembly.assemble(longPrompt, "", CTX);
    expect(result.tokenEstimate).toBe(Math.ceil(1000 / 4));
  });

  it("handles empty systemPrompt with storyState", () => {
    const result = defaultPromptAssembly.assemble("", "State data", CTX);
    expect(result.systemPrompt).toBe("\n\n## Current Story State\nState data");
    expect(result.tokenEstimate).toBe(
      Math.ceil("\n\n## Current Story State\nState data".length / 4),
    );
  });
});
