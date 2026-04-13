/**
 * Tests for lifecycle-validation.ts exported pure functions.
 *
 * Covers extractLifecycleActions and applyLifecycleVerdicts.
 */

import { describe, it, expect } from "vitest";
import {
  extractLifecycleActions,
  applyLifecycleVerdicts,
  type LifecycleVerdict,
} from "../lifecycle-validation.js";
import type { StatePipelineChange } from "@chatterbox/sockets";

function change(
  type: string,
  detail: string,
  confidence = 0.9,
): StatePipelineChange {
  return { type, detail, sourceTurn: 1, confidence };
}

// ---------------------------------------------------------------------------
// extractLifecycleActions
// ---------------------------------------------------------------------------

describe("extractLifecycleActions", () => {
  it("extracts thread_resolved changes", () => {
    const changes = [
      change("thread_resolved", "The quest was completed"),
      change("hard_fact", "Alice is brave"),
    ];
    const actions = extractLifecycleActions(changes);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe("thread_resolved");
    expect(actions[0]!.description).toBe("The quest was completed");
  });

  it("extracts hard_fact_superseded changes", () => {
    const changes = [
      change("hard_fact_superseded", "Alice is now 29"),
      change("scene_change", "moved outside"),
    ];
    const actions = extractLifecycleActions(changes);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe("hard_fact_superseded");
    expect(actions[0]!.description).toBe("Alice is now 29");
  });

  it("extracts both thread_resolved and hard_fact_superseded", () => {
    const changes = [
      change("thread_resolved", "Thread done"),
      change("hard_fact_superseded", "Fact replaced"),
      change("appearance_change", "new outfit"),
    ];
    const actions = extractLifecycleActions(changes);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.kind)).toEqual([
      "thread_resolved",
      "hard_fact_superseded",
    ]);
  });

  it("returns empty array when no lifecycle changes", () => {
    const changes = [
      change("hard_fact", "A fact"),
      change("scene_change", "moved"),
      change("appearance_change", "new hair"),
    ];
    const actions = extractLifecycleActions(changes);
    expect(actions).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(extractLifecycleActions([])).toHaveLength(0);
  });

  it("sets description and rationale from detail", () => {
    const changes = [change("thread_resolved", "The mystery was solved")];
    const actions = extractLifecycleActions(changes);
    expect(actions[0]!.description).toBe("The mystery was solved");
    expect(actions[0]!.rationale).toBe("The mystery was solved");
  });

  it("ignores similar types that are not exact matches", () => {
    const changes = [
      change("thread_evolved", "thread grew"),
      change("hard_fact_removed", "fact deleted"),
      change("thread_resolved", "thread done"),
    ];
    const actions = extractLifecycleActions(changes);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe("thread_resolved");
  });
});

// ---------------------------------------------------------------------------
// applyLifecycleVerdicts
// ---------------------------------------------------------------------------

describe("applyLifecycleVerdicts", () => {
  const baseChanges: StatePipelineChange[] = [
    change("thread_resolved", "The quest was completed"),
    change("hard_fact_superseded", "Alice age changed to 29"),
    change("scene_change", "moved to the park"),
    change("appearance_change", "new hairstyle"),
  ];

  it("returns all changes when verdicts is empty", () => {
    const result = applyLifecycleVerdicts(baseChanges, []);
    expect(result.changes).toHaveLength(4);
    expect(result.rejections).toHaveLength(0);
  });

  it("returns all changes when all verdicts are justified", () => {
    const verdicts: LifecycleVerdict[] = [
      {
        action: "The quest was completed",
        justified: true,
        reason: "Evidence supports this",
      },
      {
        action: "Alice age changed to 29",
        justified: true,
        reason: "Birthday was mentioned",
      },
    ];
    const result = applyLifecycleVerdicts(baseChanges, verdicts);
    expect(result.changes).toHaveLength(4);
    expect(result.rejections).toHaveLength(0);
  });

  it("removes unjustified thread_resolved changes", () => {
    const verdicts: LifecycleVerdict[] = [
      {
        action: "The quest was completed",
        justified: false,
        reason: "No evidence of completion",
      },
    ];
    const result = applyLifecycleVerdicts(baseChanges, verdicts);
    expect(result.changes).toHaveLength(3);
    expect(
      result.changes.find((c) => c.type === "thread_resolved"),
    ).toBeUndefined();
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]!.kind).toBe("thread_resolved");
    expect(result.rejections[0]!.reason).toBe("No evidence of completion");
  });

  it("removes unjustified hard_fact_superseded changes", () => {
    const verdicts: LifecycleVerdict[] = [
      {
        action: "Alice age changed to 29",
        justified: false,
        reason: "Age was not mentioned",
      },
    ];
    const result = applyLifecycleVerdicts(baseChanges, verdicts);
    expect(result.changes).toHaveLength(3);
    expect(
      result.changes.find((c) => c.type === "hard_fact_superseded"),
    ).toBeUndefined();
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]!.kind).toBe("hard_fact_superseded");
  });

  it("never removes non-lifecycle change types", () => {
    // Even if a verdict mentions it, scene_change and appearance_change
    // are not lifecycle types and are not filtered
    const verdicts: LifecycleVerdict[] = [
      {
        action: "moved to the park",
        justified: false,
        reason: "Not justified",
      },
    ];
    const result = applyLifecycleVerdicts(baseChanges, verdicts);
    // scene_change should still be present — the filter only removes
    // thread_resolved and hard_fact_superseded
    expect(result.changes.find((c) => c.type === "scene_change")).toBeDefined();
  });

  it("matches verdicts by substring (first 28 chars)", () => {
    const changes = [
      change(
        "thread_resolved",
        "A very long description of the thread that was resolved in the story",
      ),
    ];
    const verdicts: LifecycleVerdict[] = [
      {
        action:
          "A very long description of the thread that was resolved in the story",
        justified: false,
        reason: "No evidence",
      },
    ];
    const result = applyLifecycleVerdicts(changes, verdicts);
    expect(result.changes).toHaveLength(0);
    expect(result.rejections).toHaveLength(1);
  });

  it("populates rejection detail, kind, and reason correctly", () => {
    const changes = [
      change("hard_fact_superseded", "Old fact replaced by new"),
    ];
    const verdicts: LifecycleVerdict[] = [
      {
        action: "Old fact replaced by new",
        justified: false,
        reason: "The old fact is still valid",
      },
    ];
    const result = applyLifecycleVerdicts(changes, verdicts);
    expect(result.rejections).toHaveLength(1);
    const r = result.rejections[0]!;
    expect(r.detail).toBe("Old fact replaced by new");
    expect(r.kind).toBe("hard_fact_superseded");
    expect(r.reason).toBe("The old fact is still valid");
  });

  it("handles multiple unjustified rejections", () => {
    const verdicts: LifecycleVerdict[] = [
      {
        action: "The quest was completed",
        justified: false,
        reason: "No evidence",
      },
      {
        action: "Alice age changed to 29",
        justified: false,
        reason: "Never mentioned",
      },
    ];
    const result = applyLifecycleVerdicts(baseChanges, verdicts);
    expect(result.changes).toHaveLength(2); // only non-lifecycle changes remain
    expect(result.rejections).toHaveLength(2);
  });

  it("handles mixed justified and unjustified verdicts", () => {
    const verdicts: LifecycleVerdict[] = [
      {
        action: "The quest was completed",
        justified: true,
        reason: "Clear evidence",
      },
      {
        action: "Alice age changed to 29",
        justified: false,
        reason: "No birthday scene",
      },
    ];
    const result = applyLifecycleVerdicts(baseChanges, verdicts);
    expect(result.changes).toHaveLength(3); // thread_resolved kept, fact superseded removed
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]!.kind).toBe("hard_fact_superseded");
  });

  it("handles empty changes array", () => {
    const verdicts: LifecycleVerdict[] = [
      {
        action: "something",
        justified: false,
        reason: "doesn't matter",
      },
    ];
    const result = applyLifecycleVerdicts([], verdicts);
    expect(result.changes).toHaveLength(0);
    expect(result.rejections).toHaveLength(0);
  });
});
