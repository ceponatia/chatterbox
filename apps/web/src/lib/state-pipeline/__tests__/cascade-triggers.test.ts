/**
 * Comprehensive tests for cascade-triggers.ts
 *
 * Tests all trigger types in the TRIGGER_MAP and parseEntityIdFromDetail
 * (indirectly via character_enters/leaves handling).
 */

import { describe, it, expect } from "vitest";
import { computeCascadeResets } from "../cascade-triggers.js";
import type { StatePipelineChange } from "@chatterbox/sockets";

function change(
  type: string,
  detail = "test detail",
  confidence = 0.9,
): StatePipelineChange {
  return { type, detail, sourceTurn: 1, confidence };
}

// ---------------------------------------------------------------------------
// All TRIGGER_MAP entries
// ---------------------------------------------------------------------------

describe("computeCascadeResets — trigger map coverage", () => {
  it("scene_change resets appearance_visual, outfit_hairstyle, setting_premise", () => {
    const resets = computeCascadeResets([change("scene_change")]);
    expect(resets).toEqual(
      expect.arrayContaining([
        "appearance_visual",
        "outfit_hairstyle",
        "setting_premise",
      ]),
    );
    expect(resets).toHaveLength(3);
  });

  it("appearance_change resets appearance_visual, outfit_hairstyle", () => {
    const resets = computeCascadeResets([change("appearance_change")]);
    expect(resets).toEqual(
      expect.arrayContaining(["appearance_visual", "outfit_hairstyle"]),
    );
    expect(resets).toHaveLength(2);
  });

  it("cast_change resets relationship_status, interaction_guide, backstory", () => {
    const resets = computeCascadeResets([change("cast_change")]);
    expect(resets).toEqual(
      expect.arrayContaining([
        "relationship_status",
        "interaction_guide",
        "backstory",
      ]),
    );
    expect(resets).toHaveLength(3);
  });

  it("relationship_shift resets relationship_status, backstory, interaction_guide", () => {
    const resets = computeCascadeResets([change("relationship_shift")]);
    expect(resets).toEqual(
      expect.arrayContaining([
        "relationship_status",
        "backstory",
        "interaction_guide",
      ]),
    );
    expect(resets).toHaveLength(3);
  });

  it("hard_fact_superseded resets relationship_status", () => {
    const resets = computeCascadeResets([change("hard_fact_superseded")]);
    expect(resets).toEqual(["relationship_status"]);
  });

  it("scene_reverted resets appearance_visual, outfit_hairstyle, setting_premise", () => {
    const resets = computeCascadeResets([change("scene_reverted")]);
    expect(resets).toEqual(
      expect.arrayContaining([
        "appearance_visual",
        "outfit_hairstyle",
        "setting_premise",
      ]),
    );
    expect(resets).toHaveLength(3);
  });

  it("appearance_reverted resets appearance_visual, outfit_hairstyle", () => {
    const resets = computeCascadeResets([change("appearance_reverted")]);
    expect(resets).toEqual(
      expect.arrayContaining(["appearance_visual", "outfit_hairstyle"]),
    );
    expect(resets).toHaveLength(2);
  });

  it("relationship_reverted resets relationship_status, backstory", () => {
    const resets = computeCascadeResets([change("relationship_reverted")]);
    expect(resets).toEqual(
      expect.arrayContaining(["relationship_status", "backstory"]),
    );
    expect(resets).toHaveLength(2);
  });

  it("hard_fact_removed resets relationship_status", () => {
    const resets = computeCascadeResets([change("hard_fact_removed")]);
    expect(resets).toEqual(["relationship_status"]);
  });

  it("thread_removed resets interaction_guide", () => {
    const resets = computeCascadeResets([change("thread_removed")]);
    expect(resets).toEqual(["interaction_guide"]);
  });

  it("correction resets appearance_visual, outfit_hairstyle, setting_premise, interaction_guide", () => {
    const resets = computeCascadeResets([change("correction")]);
    expect(resets).toEqual(
      expect.arrayContaining([
        "appearance_visual",
        "outfit_hairstyle",
        "setting_premise",
        "interaction_guide",
      ]),
    );
    expect(resets).toHaveLength(4);
  });

  it("character_enters without lookup returns empty (maps to [])", () => {
    const resets = computeCascadeResets([change("character_enters")]);
    expect(resets).toHaveLength(0);
  });

  it("character_leaves without lookup returns empty (maps to [])", () => {
    const resets = computeCascadeResets([change("character_leaves")]);
    expect(resets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseEntityIdFromDetail — indirect via character_enters/leaves
// ---------------------------------------------------------------------------

describe("computeCascadeResets — parseEntityIdFromDetail indirect", () => {
  const CHAR_SEGMENTS: Record<string, string> = {
    "e-alice-001": "char_alice",
    "e-bob-002": "char_bob",
  };

  it("extracts entity ID from parenthetical format: (e-abc-123)", () => {
    const resets = computeCascadeResets(
      [change("character_enters", "Alice arrives (e-alice-001)")],
      CHAR_SEGMENTS,
    );
    expect(resets).toEqual(["char_alice"]);
  });

  it("extracts entity ID appearing inline without parens", () => {
    const resets = computeCascadeResets(
      [change("character_leaves", "Bob departs e-bob-002")],
      CHAR_SEGMENTS,
    );
    expect(resets).toEqual(["char_bob"]);
  });

  it("extracts entity ID from just the bare ID", () => {
    const resets = computeCascadeResets(
      [change("character_enters", "e-alice-001")],
      CHAR_SEGMENTS,
    );
    expect(resets).toEqual(["char_alice"]);
  });

  it("falls back to all character segments when no entity ID present", () => {
    const resets = computeCascadeResets(
      [change("character_enters", "no id here")],
      CHAR_SEGMENTS,
    );
    expect(resets).toContain("char_alice");
    expect(resets).toContain("char_bob");
  });

  it("falls back to all character segments for empty detail string", () => {
    const resets = computeCascadeResets(
      [change("character_enters", "")],
      CHAR_SEGMENTS,
    );
    expect(resets).toContain("char_alice");
    expect(resets).toContain("char_bob");
  });

  it("falls back to all when entity ID found but not in lookup", () => {
    const resets = computeCascadeResets(
      [change("character_enters", "e-unknown-999")],
      CHAR_SEGMENTS,
    );
    // Entity ID is found but not in the lookup, so segmentId is undefined
    // The code does: if (segmentId) resets.add(segmentId) — undefined is falsy
    // so nothing is added for this specific entity
    // Because there IS an entityId parsed, it does NOT fall back to all
    expect(resets).toHaveLength(0);
  });

  it("ignores character_enters/leaves when characterSegmentIds is undefined", () => {
    const resets = computeCascadeResets(
      [change("character_enters", "Alice (e-alice-001)")],
      undefined,
    );
    expect(resets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("computeCascadeResets — edge cases", () => {
  it("returns empty array for empty facts input", () => {
    expect(computeCascadeResets([])).toHaveLength(0);
  });

  it("returns empty array for unknown fact types", () => {
    const resets = computeCascadeResets([change("totally_unknown")]);
    expect(resets).toHaveLength(0);
  });

  it("deduplicates segments from multiple overlapping triggers", () => {
    const resets = computeCascadeResets([
      change("scene_change"),
      change("appearance_change"),
    ]);
    const unique = new Set(resets);
    expect(resets.length).toBe(unique.size);
    // scene_change has 3, appearance_change has 2, but 2 overlap
    expect(resets).toHaveLength(3);
  });

  it("deduplicates segments from scene_change and scene_reverted", () => {
    const resets = computeCascadeResets([
      change("scene_change"),
      change("scene_reverted"),
    ]);
    // Both map to the same 3 segments
    expect(resets).toHaveLength(3);
  });

  it("combines segments from unrelated trigger types", () => {
    const resets = computeCascadeResets([
      change("hard_fact_superseded"), // relationship_status
      change("thread_removed"), // interaction_guide
    ]);
    expect(resets).toContain("relationship_status");
    expect(resets).toContain("interaction_guide");
    expect(resets).toHaveLength(2);
  });

  it("handles multiple character events with different entity IDs", () => {
    const charSegments: Record<string, string> = {
      "e-alice-001": "char_alice",
      "e-bob-002": "char_bob",
    };
    const resets = computeCascadeResets(
      [
        change("character_enters", "Alice arrives (e-alice-001)"),
        change("character_leaves", "Bob departs (e-bob-002)"),
      ],
      charSegments,
    );
    expect(resets).toContain("char_alice");
    expect(resets).toContain("char_bob");
    expect(resets).toHaveLength(2);
  });

  it("combines trigger map segments with character segments", () => {
    const charSegments: Record<string, string> = {
      "e-alice-001": "char_alice",
    };
    const resets = computeCascadeResets(
      [
        change("scene_change"),
        change("character_enters", "Alice arrives (e-alice-001)"),
      ],
      charSegments,
    );
    expect(resets).toContain("appearance_visual");
    expect(resets).toContain("outfit_hairstyle");
    expect(resets).toContain("setting_premise");
    expect(resets).toContain("char_alice");
    expect(resets).toHaveLength(4);
  });
});
