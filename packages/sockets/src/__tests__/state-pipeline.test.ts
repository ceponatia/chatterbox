/**
 * Tests for the StatePipelineSocket contract.
 *
 * Validates that defaultStatePipeline is a correct pass-through implementation
 * of the socket interface — it must return the current state unchanged, produce
 * no changes, pass all validation checks, and auto-accept the result.
 */

import { describe, it, expect } from "vitest";
import { defaultStatePipeline, type StatePipelineRequest } from "../index.js";

const BASE_REQUEST: StatePipelineRequest = {
  messages: [
    { id: "1", role: "user", content: "Hello there." },
    { id: "2", role: "assistant", content: "Hi! How can I help?" },
  ],
  currentStoryState:
    "## Cast\n\nAlice — protagonist\n\n## Scene\n\nA quiet café.",
  turnNumber: 1,
  lastPipelineTurn: 0,
};

describe("defaultStatePipeline", () => {
  it("returns current state unchanged", async () => {
    const result = await defaultStatePipeline.run(BASE_REQUEST);
    expect(result.newState).toBe(BASE_REQUEST.currentStoryState);
  });

  it("returns no changes", async () => {
    const result = await defaultStatePipeline.run(BASE_REQUEST);
    expect(result.changes).toHaveLength(0);
  });

  it("returns auto_accepted disposition", async () => {
    const result = await defaultStatePipeline.run(BASE_REQUEST);
    expect(result.disposition).toBe("auto_accepted");
  });

  it("returns no cascade resets", async () => {
    const result = await defaultStatePipeline.run(BASE_REQUEST);
    expect(result.cascadeResets).toHaveLength(0);
  });

  it("returns a passing validation report", async () => {
    const result = await defaultStatePipeline.run(BASE_REQUEST);
    expect(result.validation.schemaValid).toBe(true);
    expect(result.validation.allHardFactsPreserved).toBe(true);
    expect(result.validation.noUnknownFacts).toBe(true);
    expect(result.validation.outputComplete).toBe(true);
    expect(result.validation.diffPercentage).toBe(0);
  });

  it("echoes back the turnNumber", async () => {
    const result = await defaultStatePipeline.run(BASE_REQUEST);
    expect(result.turnNumber).toBe(BASE_REQUEST.turnNumber);
  });

  it("returns empty candidateFacts", async () => {
    const result = await defaultStatePipeline.run(BASE_REQUEST);
    expect(result.candidateFacts).toEqual([]);
  });

  it("works with empty state", async () => {
    const result = await defaultStatePipeline.run({
      ...BASE_REQUEST,
      currentStoryState: "",
    });
    expect(result.newState).toBe("");
    expect(result.disposition).toBe("auto_accepted");
  });

  it("works with empty message list", async () => {
    const result = await defaultStatePipeline.run({
      ...BASE_REQUEST,
      messages: [],
    });
    expect(result.newState).toBe(BASE_REQUEST.currentStoryState);
  });
});
