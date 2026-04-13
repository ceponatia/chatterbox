/**
 * Comprehensive tests for validation.ts
 *
 * Tests validateState (exported) which exercises extractHardFacts and
 * computeDiffPercentage internally.
 */

import { describe, it, expect } from "vitest";
import { validateState } from "../validation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATE = [
  "## Cast\n\nAlice -- protagonist",
  "## Relationships\n\nAlice and Bob -- friendly",
  "## Characters\n\n### Alice\n\n#### Appearance\n\n- **hair**: brown",
  "## Scene\n\nThe cafe at noon.",
  "## Current Demeanor\n\nAlice: relaxed",
  "## Open Threads\n\n- Unresolved tension (added: 2026-01-01)",
  "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
].join("\n\n");

const MINIMAL_VALID_STATE = [
  "## Cast\nA",
  "## Relationships\nA",
  "## Characters\nA",
  "## Scene\nA",
  "## Current Demeanor\nA",
  "## Open Threads\nA",
  "## Hard Facts\nA",
].join("\n\n");

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("validateState — schema validation", () => {
  it("passes with all required sections present and non-empty", () => {
    const report = validateState(VALID_STATE, "", []);
    expect(report.schemaValid).toBe(true);
  });

  it("fails when ## Cast is missing", () => {
    const broken = VALID_STATE.replace(/## Cast\n\n[^\n]+/, "");
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails when ## Relationships is missing", () => {
    const broken = VALID_STATE.replace(
      /## Relationships\n\n[^\n]+/,
      "",
    );
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails when ## Characters is missing", () => {
    const broken = VALID_STATE.replace(
      /## Characters[\s\S]*?(?=\n\n## Scene)/,
      "",
    );
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails when ## Scene is missing", () => {
    const broken = VALID_STATE.replace(
      /## Scene\n\n[^\n]+/,
      "",
    );
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails when ## Current Demeanor is missing", () => {
    const broken = VALID_STATE.replace(
      /## Current Demeanor\n\n[^\n]+/,
      "",
    );
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails when ## Open Threads is missing", () => {
    const broken = VALID_STATE.replace(
      /## Open Threads\n\n[^\n]+/,
      "",
    );
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails when ## Hard Facts is missing", () => {
    const broken = VALID_STATE.replace(
      /## Hard Facts\n\n[^\n]+/,
      "",
    );
    const report = validateState(broken, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("fails when section heading present but no content after it (at end of string)", () => {
    // Hard Facts heading present but nothing after (trimmed empty)
    const state = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts",
    );
    const report = validateState(state, "", []);
    expect(report.schemaValid).toBe(false);
  });

  it("passes when section heading has minimal content", () => {
    const report = validateState(MINIMAL_VALID_STATE, "", []);
    // Minimal content: each section has at least "A" after header
    // but total length is < 50 so outputComplete might be false
    expect(report.schemaValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hard fact novelty (exercises extractHardFacts internally)
// ---------------------------------------------------------------------------

describe("validateState — hard fact novelty", () => {
  it("accepts when all hard facts existed in previous state", () => {
    const report = validateState(VALID_STATE, VALID_STATE, []);
    expect(report.noUnknownFacts).toBe(true);
  });

  it("accepts when new fact matches an extracted fact exactly", () => {
    const candidate = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)\n- Bob is a teacher. (added: 2026-02-01)",
    );
    const report = validateState(candidate, VALID_STATE, [
      {
        type: "hard_fact",
        detail: "Bob is a teacher.",
        sourceTurn: 1,
        confidence: 0.9,
      },
    ]);
    expect(report.noUnknownFacts).toBe(true);
  });

  it("flags when new fact has no matching extracted fact", () => {
    const candidate = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)\n- Mystery fact. (added: 2026-02-01)",
    );
    const report = validateState(candidate, VALID_STATE, []);
    expect(report.noUnknownFacts).toBe(false);
  });

  it("accepts via substring matching when new fact includes first 30 chars of extracted detail", () => {
    const candidate = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)\n- Bob moved to town and settled in nicely. (added: 2026-02-01)",
    );
    const report = validateState(candidate, VALID_STATE, [
      {
        type: "hard_fact",
        detail: "Bob moved to town",
        sourceTurn: 1,
        confidence: 0.9,
      },
    ]);
    expect(report.noUnknownFacts).toBe(true);
  });

  it("handles state with no Hard Facts section (previous)", () => {
    const prevNoFacts = VALID_STATE.replace(
      "\n\n## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "",
    );
    const report = validateState(VALID_STATE, prevNoFacts, [
      {
        type: "hard_fact",
        detail: "Alice is 28.",
        sourceTurn: 1,
        confidence: 0.9,
      },
    ]);
    expect(report.noUnknownFacts).toBe(true);
  });

  it("handles state with empty Hard Facts section", () => {
    const emptyFacts = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts\n\n",
    );
    const report = validateState(emptyFacts, VALID_STATE, []);
    // No new facts (empty candidate), so noUnknownFacts is vacuously true
    expect(report.noUnknownFacts).toBe(true);
  });

  it("handles Hard Facts at end of string with no trailing section", () => {
    // Hard Facts is the last section — regex must match to end of string
    const state =
      "## Cast\n\nAlice\n\n## Relationships\n\nFriends\n\n## Characters\n\nA\n\n## Scene\n\nPark\n\n## Current Demeanor\n\nHappy\n\n## Open Threads\n\nThread\n\n## Hard Facts\n\n- Fact A\n- Fact B";
    const report = validateState(state, state, []);
    expect(report.noUnknownFacts).toBe(true);
  });

  it("uses case-insensitive comparison for fact matching", () => {
    const candidate = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)\n- BOB IS TALL",
    );
    const prev = VALID_STATE;
    const report = validateState(candidate, prev, [
      {
        type: "hard_fact",
        detail: "bob is tall",
        sourceTurn: 1,
        confidence: 0.9,
      },
    ]);
    expect(report.noUnknownFacts).toBe(true);
  });

  it("strips bullet markers when parsing facts", () => {
    // Fact lines use "- " prefix — extractHardFacts strips it
    const candidate = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)\n* New bullet fact",
    );
    const report = validateState(candidate, VALID_STATE, [
      {
        type: "hard_fact",
        detail: "New bullet fact",
        sourceTurn: 1,
        confidence: 0.9,
      },
    ]);
    expect(report.noUnknownFacts).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Diff percentage (exercises computeDiffPercentage internally)
// ---------------------------------------------------------------------------

describe("validateState — diff percentage", () => {
  it("reports 0% for identical states", () => {
    const report = validateState(VALID_STATE, VALID_STATE, []);
    expect(report.diffPercentage).toBe(0);
  });

  it("reports 100% when previous is empty", () => {
    const report = validateState(VALID_STATE, "", []);
    expect(report.diffPercentage).toBe(100);
  });

  it("reports 100% when previous is whitespace only", () => {
    const report = validateState(VALID_STATE, "   \n  \n  ", []);
    expect(report.diffPercentage).toBe(100);
  });

  it("reports intermediate diff for partial changes", () => {
    const modified = VALID_STATE.replace(
      "The cafe at noon.",
      "The park at sunset.",
    );
    const report = validateState(modified, VALID_STATE, []);
    expect(report.diffPercentage).toBeGreaterThan(0);
    expect(report.diffPercentage).toBeLessThan(100);
  });

  it("reports very high diff for mostly different content", () => {
    const totallyDifferent =
      "## Cast\n\nZoe the wanderer\n\n## Relationships\n\nZoe has no friends\n\n## Characters\n\n### Zoe\n\n#### Appearance\n\n- **hair**: red\n- **eyes**: green\n- **build**: wiry\n\n## Scene\n\nA vast desert with endless dunes.\n\n## Current Demeanor\n\nZoe: stoic and distant\n\n## Open Threads\n\n- Searching for the oasis\n- Escaping the sandstorm\n\n## Hard Facts\n\n- Zoe is alone\n- The desert is endless\n- Water is scarce";
    const report = validateState(totallyDifferent, VALID_STATE, []);
    expect(report.diffPercentage).toBeGreaterThan(50);
  });

  it("handles empty candidate lines gracefully", () => {
    // The candidate has many blank lines — they get filtered out
    const candidate =
      "## Cast\n\n\n\nAlice\n\n## Relationships\n\n\nFriends\n\n## Characters\n\nA\n\n## Scene\n\nPark\n\n## Current Demeanor\n\nHappy\n\n## Open Threads\n\nThread\n\n## Hard Facts\n\n- Fact";
    const report = validateState(candidate, candidate, []);
    expect(report.diffPercentage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

describe("validateState — completeness", () => {
  it("marks outputComplete false when candidate is very short", () => {
    const report = validateState("## Cast\nA", "", []);
    expect(report.outputComplete).toBe(false);
  });

  it("marks outputComplete false when schema is invalid", () => {
    const longButMissingSections = "A".repeat(200);
    const report = validateState(longButMissingSections, "", []);
    expect(report.outputComplete).toBe(false);
  });

  it("marks outputComplete true when schema valid and long enough", () => {
    const report = validateState(VALID_STATE, "", []);
    expect(report.outputComplete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// allHardFactsPreserved (always true in current implementation)
// ---------------------------------------------------------------------------

describe("validateState — allHardFactsPreserved", () => {
  it("is always true regardless of candidate content", () => {
    const report = validateState("## Cast\nA", VALID_STATE, []);
    expect(report.allHardFactsPreserved).toBe(true);
  });

  it("is always true even when facts are removed", () => {
    const emptyFacts = VALID_STATE.replace(
      "## Hard Facts\n\n- Alice is 28. (added: 2026-01-01)",
      "## Hard Facts\n\n(none)",
    );
    const report = validateState(emptyFacts, VALID_STATE, []);
    expect(report.allHardFactsPreserved).toBe(true);
  });
});
