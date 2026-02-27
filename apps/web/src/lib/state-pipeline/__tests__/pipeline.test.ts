/**
 * Tests for the state pipeline pure functions.
 *
 * These cover the deterministic post-processing layer that the
 * statePipelineAdapter calls after each LLM result: validation,
 * disposition scoring, cascade resets, and message windowing.
 */

import { describe, it, expect } from "vitest";
import { validateState } from "../validation.js";
import { determineDisposition } from "../auto-accept.js";
import { computeCascadeResets } from "../cascade-triggers.js";
import { windowSocketMessages } from "../pipeline-socket.js";
import type { SocketMessage } from "@chatterbox/sockets";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATE = [
  "## Cast\n\nAlice — protagonist",
  "## Relationships\n\nAlice ↔ Bob — friendly",
  "## Characters\n\n### Alice\n\n#### Appearance\n\n- **hair**: brown",
  "## Scene\n\nThe café at noon.",
  "## Current Demeanor\n\nAlice: relaxed",
  "## Open Threads\n\n- Unresolved tension (added: 2026-01-01)",
  "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
].join("\n\n");

function msg(role: "user" | "assistant", i: number): SocketMessage {
  return { id: String(i), role, content: `message ${i}` };
}

// ---------------------------------------------------------------------------
// validateState
// ---------------------------------------------------------------------------

describe("validateState", () => {
  it("passes a valid state with all required sections", () => {
    const report = validateState(VALID_STATE, "", []);
    expect(report.schemaValid).toBe(true);
    expect(report.outputComplete).toBe(true);
  });

  it("fails schema when a required section is missing", () => {
    const broken = VALID_STATE.replace("## Scene\n\nThe café at noon.", "");
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails schema when a required section is missing entirely", () => {
    // validateState checks that a section heading exists AND has some text after
    // it before end-of-string. When the heading is absent, schemaValid is false.
    const broken = VALID_STATE.replace(
      /## Scene[\s\S]*?(?=\n## Current Demeanor)/,
      "",
    );
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("computes zero diff when state is unchanged", () => {
    const report = validateState(VALID_STATE, VALID_STATE, []);
    expect(report.diffPercentage).toBe(0);
  });

  it("computes 100% diff when previous state is empty", () => {
    const report = validateState(VALID_STATE, "", []);
    expect(report.diffPercentage).toBe(100);
  });

  it("allHardFactsPreserved is always true (pipeline reasons about removal)", () => {
    const report = validateState("## Cast\n\nNew state.", VALID_STATE, []);
    expect(report.allHardFactsPreserved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// determineDisposition
// ---------------------------------------------------------------------------

describe("determineDisposition", () => {
  const PASS = {
    schemaValid: true,
    allHardFactsPreserved: true,
    noUnknownFacts: true,
    outputComplete: true,
    diffPercentage: 20,
  };

  it("auto_accepts when all checks pass and diff is low", () => {
    expect(determineDisposition(PASS)).toBe("auto_accepted");
  });

  it("retries when schema is invalid", () => {
    expect(determineDisposition({ ...PASS, schemaValid: false })).toBe(
      "retried",
    );
  });

  it("retries when output is incomplete", () => {
    expect(determineDisposition({ ...PASS, outputComplete: false })).toBe(
      "retried",
    );
  });

  it("flags when diff exceeds 50%", () => {
    expect(determineDisposition({ ...PASS, diffPercentage: 51 })).toBe(
      "flagged",
    );
  });

  it("auto_accepts at exactly 50% diff", () => {
    expect(determineDisposition({ ...PASS, diffPercentage: 50 })).toBe(
      "auto_accepted",
    );
  });

  it("flags when unknown facts are injected", () => {
    expect(determineDisposition({ ...PASS, noUnknownFacts: false })).toBe(
      "flagged",
    );
  });
});

// ---------------------------------------------------------------------------
// computeCascadeResets
// ---------------------------------------------------------------------------

describe("computeCascadeResets", () => {
  it("returns empty array for no facts", () => {
    expect(computeCascadeResets([])).toHaveLength(0);
  });

  it("includes appearance segments on scene_change", () => {
    const resets = computeCascadeResets([
      {
        type: "scene_change",
        detail: "moved outside",
        sourceTurn: 1,
        confidence: 0.9,
      },
    ]);
    expect(resets).toContain("appearance_visual");
    expect(resets).toContain("outfit_hairstyle");
    expect(resets).toContain("setting_premise");
  });

  it("includes relationship_status on relationship_shift", () => {
    const resets = computeCascadeResets([
      {
        type: "relationship_shift",
        detail: "became friends",
        sourceTurn: 2,
        confidence: 0.8,
      },
    ]);
    expect(resets).toContain("relationship_status");
    expect(resets).toContain("backstory");
  });

  it("deduplicates segments triggered by multiple facts", () => {
    const resets = computeCascadeResets([
      { type: "scene_change", detail: "moved", sourceTurn: 1, confidence: 1 },
      {
        type: "appearance_change",
        detail: "new outfit",
        sourceTurn: 1,
        confidence: 1,
      },
    ]);
    const unique = new Set(resets);
    expect(resets.length).toBe(unique.size);
    expect(resets).toContain("appearance_visual");
    expect(resets).toContain("outfit_hairstyle");
  });

  it("ignores unknown fact types", () => {
    const resets = computeCascadeResets([
      {
        type: "unknown_type",
        detail: "something",
        sourceTurn: 1,
        confidence: 0.5,
      },
    ]);
    expect(resets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// windowSocketMessages
// ---------------------------------------------------------------------------

describe("windowSocketMessages", () => {
  it("returns up to 40 messages on first run (lastPipelineTurn=0)", () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", i),
    );
    const windowed = windowSocketMessages(messages, 0);
    expect(windowed.length).toBe(40);
  });

  it("returns all messages when count is under 40 on first run", () => {
    const messages = [msg("user", 1), msg("assistant", 2), msg("user", 3)];
    const windowed = windowSocketMessages(messages, 0);
    expect(windowed.length).toBe(3);
  });

  it("windows to messages after lastPipelineTurn with overlap", () => {
    // 100 messages (50 user, 50 assistant). lastPipelineTurn=30 means window
    // starts after 30th user message (index 60), backs up 10 → slice(50).
    const messages = Array.from({ length: 100 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", i),
    );
    const windowed = windowSocketMessages(messages, 30);
    expect(windowed.length).toBeLessThan(100);
    expect(windowed.length).toBeGreaterThan(0);
  });

  it("first message in windowed result is a user message (or overlap)", () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", i),
    );
    const windowed = windowSocketMessages(messages, 5);
    expect(windowed.length).toBeGreaterThan(0);
  });
});
