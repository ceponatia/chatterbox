import { describe, it, expect } from "vitest";
import {
  emptyStructuredState,
  emptySectionMeta,
  normalizeSectionMeta,
  applySectionMetaTransition,
  type StructuredStoryState,
} from "../types";

describe("emptyStructuredState", () => {
  it("returns an object with all required fields as empty arrays/defaults", () => {
    const state = emptyStructuredState();
    expect(state.entities).toEqual([]);
    expect(state.relationships).toEqual([]);
    expect(state.appearance).toEqual([]);
    expect(state.scene).toEqual({
      location: "",
      presentEntityIds: [],
      atmosphere: "",
    });
    expect(state.demeanor).toEqual([]);
    expect(state.openThreads).toEqual([]);
    expect(state.hardFacts).toEqual([]);
    expect(state.style).toEqual([]);
    expect(state.custom).toEqual([]);
    expect(state.sectionMeta).toEqual(emptySectionMeta());
  });
});

describe("emptySectionMeta", () => {
  it("returns record with all 9 section keys, each with defaults", () => {
    const meta = emptySectionMeta();
    const expectedKeys = [
      "cast",
      "relationships",
      "characters",
      "scene",
      "demeanor",
      "openThreads",
      "hardFacts",
      "style",
      "custom",
    ];
    expect(Object.keys(meta).sort()).toEqual(expectedKeys.sort());
    for (const key of expectedKeys) {
      expect(meta[key]).toEqual({ lastUpdatedAt: 0, updateCount: 0 });
    }
  });
});

describe("normalizeSectionMeta", () => {
  it("returns empty defaults for undefined input", () => {
    const result = normalizeSectionMeta(undefined);
    expect(result).toEqual(emptySectionMeta());
  });

  it("returns empty defaults filled in for empty object", () => {
    const result = normalizeSectionMeta({});
    expect(result).toEqual(emptySectionMeta());
  });

  it("clamps negative values to 0", () => {
    const result = normalizeSectionMeta({
      cast: { lastUpdatedAt: -5, updateCount: -1 },
    });
    expect(result["cast"]).toEqual({ lastUpdatedAt: 0, updateCount: 0 });
  });

  it("clamps NaN values to 0", () => {
    const result = normalizeSectionMeta({
      cast: { lastUpdatedAt: NaN, updateCount: NaN },
    });
    expect(result["cast"]).toEqual({ lastUpdatedAt: 0, updateCount: 0 });
  });

  it("floors float values", () => {
    const result = normalizeSectionMeta({
      scene: { lastUpdatedAt: 3.7, updateCount: 2.9 },
    });
    expect(result["scene"]).toEqual({ lastUpdatedAt: 3, updateCount: 2 });
  });
});

describe("applySectionMetaTransition", () => {
  it("returns incoming with normalized meta when previous is null", () => {
    const incoming = emptyStructuredState();
    const result = applySectionMetaTransition(null, incoming, 5);
    expect(result.sectionMeta).toEqual(
      normalizeSectionMeta(incoming.sectionMeta),
    );
  });

  it("bumps meta only for changed sections", () => {
    const previous: StructuredStoryState = {
      ...emptyStructuredState(),
      scene: { location: "park", presentEntityIds: [], atmosphere: "calm" },
    };

    const incoming: StructuredStoryState = {
      ...emptyStructuredState(),
      scene: { location: "cafe", presentEntityIds: [], atmosphere: "busy" },
    };

    const result = applySectionMetaTransition(previous, incoming, 5);

    // scene changed - should be bumped
    expect(result.sectionMeta["scene"]!.lastUpdatedAt).toBe(5);
    expect(result.sectionMeta["scene"]!.updateCount).toBe(1);

    // cast did not change - should remain at 0
    expect(result.sectionMeta["cast"]!.lastUpdatedAt).toBe(0);
    expect(result.sectionMeta["cast"]!.updateCount).toBe(0);

    // relationships did not change - should remain at 0
    expect(result.sectionMeta["relationships"]!.lastUpdatedAt).toBe(0);
    expect(result.sectionMeta["relationships"]!.updateCount).toBe(0);
  });
});
