import { describe, it, expect } from "vitest";
import { resolveEffectiveState } from "../effective-state.js";
import {
  emptyStructuredState,
  type Entity,
  type StructuredStoryState,
} from "../types.js";

const ALICE: Entity = {
  id: "e-alice",
  name: "Alice",
  description: "Main character",
  isPlayerCharacter: false,
};
const BOB: Entity = {
  id: "e-bob",
  name: "Bob",
  description: "Side character",
  isPlayerCharacter: true,
};

function base(
  overrides: Partial<StructuredStoryState> = {},
): StructuredStoryState {
  return { ...emptyStructuredState(), ...overrides };
}

describe("resolveEffectiveState", () => {
  it("returns empty state when both are null", () => {
    const result = resolveEffectiveState({ baseline: null, runtime: null });
    expect(result).toEqual(emptyStructuredState());
  });

  it("returns baseline when runtime is null", () => {
    const baseline = base({ entities: [ALICE] });
    const result = resolveEffectiveState({ baseline, runtime: null });
    expect(result).toBe(baseline);
  });

  it("returns runtime when baseline is null", () => {
    const runtime = base({ entities: [BOB] });
    const result = resolveEffectiveState({ baseline: null, runtime });
    expect(result).toBe(runtime);
  });

  it("uses runtime lists when non-empty, falls back to baseline", () => {
    const baseline = base({
      entities: [ALICE],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-bob",
          description: "friends",
          details: [],
        },
      ],
      style: ["poetic"],
    });
    const runtime = base({
      entities: [BOB],
      relationships: [],
      style: [],
    });

    const result = resolveEffectiveState({ baseline, runtime });

    // Runtime entities non-empty -> use runtime
    expect(result.entities).toEqual([BOB]);
    // Runtime relationships empty -> fall back to baseline
    expect(result.relationships).toEqual(baseline.relationships);
    // Runtime style empty -> fall back to baseline
    expect(result.style).toEqual(["poetic"]);
  });

  it("merges scene: location from runtime when non-empty", () => {
    const baseline = base({
      scene: {
        location: "Forest",
        presentEntityIds: ["e-alice"],
        atmosphere: "misty",
      },
    });
    const runtime = base({
      scene: { location: "Castle", presentEntityIds: [], atmosphere: "" },
    });

    const result = resolveEffectiveState({ baseline, runtime });

    expect(result.scene.location).toBe("Castle");
    // presentEntityIds empty in runtime -> fall back to baseline
    expect(result.scene.presentEntityIds).toEqual(["e-alice"]);
    // atmosphere empty in runtime -> fall back to baseline
    expect(result.scene.atmosphere).toBe("misty");
  });

  it("falls back scene location to baseline when runtime is empty", () => {
    const baseline = base({
      scene: { location: "Forest", presentEntityIds: [], atmosphere: "calm" },
    });
    const runtime = base({
      scene: { location: "", presentEntityIds: ["e-bob"], atmosphere: "" },
    });

    const result = resolveEffectiveState({ baseline, runtime });

    expect(result.scene.location).toBe("Forest");
    expect(result.scene.presentEntityIds).toEqual(["e-bob"]);
    expect(result.scene.atmosphere).toBe("calm");
  });

  it("takes sectionMeta from runtime", () => {
    const baseline = base();
    baseline.sectionMeta["cast"] = { lastUpdatedAt: 1, updateCount: 1 };

    const runtime = base();
    runtime.sectionMeta["cast"] = { lastUpdatedAt: 5, updateCount: 3 };

    const result = resolveEffectiveState({ baseline, runtime });

    expect(result.sectionMeta).toBe(runtime.sectionMeta);
  });
});
