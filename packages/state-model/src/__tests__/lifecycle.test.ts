import { describe, it, expect } from "vitest";
import {
  reconcileLifecycleState,
  ensureLifecycleDefaults,
} from "../lifecycle.js";
import {
  emptyStructuredState,
  type Entity,
  type HardFact,
  type StoryThread,
  type StructuredStoryState,
} from "../types.js";

const TODAY = "2026-01-15";

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

// ---------------------------------------------------------------------------
// reconcileLifecycleState
// ---------------------------------------------------------------------------
describe("reconcileLifecycleState", () => {
  it("returns incoming unchanged when previous is null", () => {
    const incoming = base({ entities: [ALICE] });
    const result = reconcileLifecycleState(null, incoming, TODAY);
    expect(result).toBe(incoming);
  });

  it("hydrates hard fact dates from matching previous fact", () => {
    const prevFact: HardFact = {
      fact: "Alice likes cats",
      superseded: false,
      createdAt: "2025-12-01",
      establishedAt: "2025-12-01",
      lastConfirmedAt: "2025-12-20",
    };
    const previous = base({ hardFacts: [prevFact] });
    const incoming = base({
      hardFacts: [{ fact: "Alice likes cats", superseded: false }],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    expect(result.hardFacts[0]!.createdAt).toBe("2025-12-01");
    expect(result.hardFacts[0]!.establishedAt).toBe("2025-12-01");
    expect(result.hardFacts[0]!.lastConfirmedAt).toBe("2025-12-20");
  });

  it("archives superseded facts not present in incoming", () => {
    const prevFact: HardFact = {
      fact: "Bob is tall",
      superseded: false,
      createdAt: "2025-11-01",
    };
    const previous = base({ hardFacts: [prevFact] });
    const incoming = base({ hardFacts: [] });

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    expect(result.hardFacts).toHaveLength(1);
    expect(result.hardFacts[0]!.superseded).toBe(true);
    expect(result.hardFacts[0]!.supersededBy).toContain(TODAY);
  });

  it("hydrates thread dates from matching previous thread by ID", () => {
    const prevThread: StoryThread = {
      id: "t-1",
      description: "Find the treasure",
      resolutionHint: "",
      status: "active",
      createdAt: "2025-10-01",
      lastReferencedAt: "2025-12-15",
    };
    const previous = base({ openThreads: [prevThread] });
    const incoming = base({
      openThreads: [
        {
          id: "t-1",
          description: "Find the treasure",
          resolutionHint: "",
          status: "active",
        },
      ],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    expect(result.openThreads[0]!.createdAt).toBe("2025-10-01");
    expect(result.openThreads[0]!.lastReferencedAt).toBe("2025-12-15");
  });

  it("hydrates thread by normalized description when IDs differ", () => {
    const prevThread: StoryThread = {
      id: "t-old",
      description: "Find the treasure",
      resolutionHint: "",
      status: "active",
      createdAt: "2025-09-01",
      lastReferencedAt: "2025-11-01",
    };
    const previous = base({ openThreads: [prevThread] });
    const incoming = base({
      openThreads: [
        {
          id: "t-new",
          description: "find the treasure",
          resolutionHint: "",
          status: "active",
        },
      ],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    // Should carry forward previous ID
    expect(result.openThreads[0]!.id).toBe("t-old");
    expect(result.openThreads[0]!.createdAt).toBe("2025-09-01");
  });

  it("archives removed threads as resolved", () => {
    const prevThread: StoryThread = {
      id: "t-gone",
      description: "Solve the mystery",
      resolutionHint: "",
      status: "active",
      createdAt: "2025-08-01",
    };
    const previous = base({ openThreads: [prevThread] });
    const incoming = base({ openThreads: [] });

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    expect(result.openThreads).toHaveLength(1);
    expect(result.openThreads[0]!.status).toBe("resolved");
    expect(result.openThreads[0]!.closureRationale).toContain(TODAY);
  });

  it("keeps already-resolved status when archiving threads", () => {
    const prevThread: StoryThread = {
      id: "t-done",
      description: "Old completed thread",
      resolutionHint: "",
      status: "resolved",
      closureRationale: "Finished earlier",
      createdAt: "2025-07-01",
    };
    const previous = base({ openThreads: [prevThread] });
    const incoming = base({ openThreads: [] });

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    expect(result.openThreads[0]!.status).toBe("resolved");
    expect(result.openThreads[0]!.closureRationale).toBe("Finished earlier");
  });

  it("preserves player flag from previous entities", () => {
    const previous = base({ entities: [ALICE, BOB] });
    const incoming = base({
      entities: [
        { ...ALICE, isPlayerCharacter: false },
        { ...BOB, isPlayerCharacter: false },
      ],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    const bob = result.entities.find((e) => e.name === "Bob");
    expect(bob?.isPlayerCharacter).toBe(true);

    const alice = result.entities.find((e) => e.name === "Alice");
    expect(alice?.isPlayerCharacter).toBe(false);
  });

  it("uses provided today parameter", () => {
    const custom = "2099-06-01";
    const previous = base({
      hardFacts: [{ fact: "Stale fact", superseded: false }],
    });
    const incoming = base({ hardFacts: [] });

    const result = reconcileLifecycleState(previous, incoming, custom);

    expect(result.hardFacts[0]!.supersededBy).toContain(custom);
  });

  it("normalizes sectionMeta from previous", () => {
    const previous = base();
    previous.sectionMeta = {
      cast: { lastUpdatedAt: 5, updateCount: 2 },
    } as never;
    const incoming = base();

    const result = reconcileLifecycleState(previous, incoming, TODAY);

    expect(result.sectionMeta["cast"]).toEqual({
      lastUpdatedAt: 5,
      updateCount: 2,
    });
    // Missing keys should be filled with zeros
    expect(result.sectionMeta["relationships"]).toEqual({
      lastUpdatedAt: 0,
      updateCount: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// ensureLifecycleDefaults
// ---------------------------------------------------------------------------
describe("ensureLifecycleDefaults", () => {
  it("infers tone on relationships that lack it", () => {
    const state = base({
      entities: [ALICE, BOB],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-bob",
          description: "Alice and Bob are close friends",
          details: [],
        },
      ],
    });

    const result = ensureLifecycleDefaults(state, TODAY);

    expect(result.relationships[0]!.tone).toBeDefined();
  });

  it("infers category on appearance entries that lack it", () => {
    const state = base({
      entities: [ALICE],
      appearance: [
        {
          entityId: "e-alice",
          attribute: "Hair color",
          description: "Long brown hair",
        },
      ],
    });

    const result = ensureLifecycleDefaults(state, TODAY);

    expect(result.appearance[0]!.category).toBeDefined();
  });

  it("fills defaults on threads missing fields", () => {
    const state = base({
      openThreads: [
        {
          id: undefined as unknown as string,
          description: "Explore the dungeon",
          resolutionHint: "",
          status: "active" as const,
        },
      ],
    });

    const result = ensureLifecycleDefaults(state, TODAY);
    const thread = result.openThreads[0]!;

    expect(thread.id).toBeTruthy();
    expect(thread.hook).toBeDefined();
    expect(thread.createdAt).toBe(TODAY);
    expect(thread.lastReferencedAt).toBe(TODAY);
    expect(thread.status).toBe("active");
  });

  it("fills defaults on facts missing fields", () => {
    const state = base({
      hardFacts: [{ fact: "The sky is blue", superseded: false }],
    });

    const result = ensureLifecycleDefaults(state, TODAY);
    const fact = result.hardFacts[0]!;

    expect(fact.summary).toBeDefined();
    expect(fact.tags).toBeDefined();
    expect(fact.createdAt).toBe(TODAY);
    expect(fact.establishedAt).toBe(TODAY);
    expect(fact.lastConfirmedAt).toBe(TODAY);
  });

  it("normalizes sectionMeta", () => {
    const state = base();
    state.sectionMeta = {} as never;

    const result = ensureLifecycleDefaults(state, TODAY);

    expect(result.sectionMeta["cast"]).toEqual({
      lastUpdatedAt: 0,
      updateCount: 0,
    });
  });

  it("uses provided today parameter for dates", () => {
    const custom = "2099-12-31";
    const state = base({
      hardFacts: [{ fact: "A fact", superseded: false }],
      openThreads: [
        {
          id: "",
          description: "A thread",
          resolutionHint: "",
          status: "active" as const,
        },
      ],
    });

    const result = ensureLifecycleDefaults(state, custom);

    expect(result.hardFacts[0]!.createdAt).toBe(custom);
    expect(result.openThreads[0]!.createdAt).toBe(custom);
  });
});
