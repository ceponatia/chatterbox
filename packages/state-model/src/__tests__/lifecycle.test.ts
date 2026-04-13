import { describe, it, expect } from "vitest";
import { reconcileLifecycleState, ensureLifecycleDefaults } from "../lifecycle";
import {
  emptyStructuredState,
  type Entity,
  type HardFact,
  type StoryThread,
  type StructuredStoryState,
} from "../types";

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

  it("preserves existing tone on relationships", () => {
    const state = base({
      entities: [ALICE, BOB],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-bob",
          description: "They are rivals",
          details: [],
          tone: "hostile",
        },
      ],
    });

    const result = ensureLifecycleDefaults(state, TODAY);
    expect(result.relationships[0]!.tone).toBe("hostile");
  });

  it("preserves existing category on appearance", () => {
    const state = base({
      entities: [ALICE],
      appearance: [
        {
          entityId: "e-alice",
          attribute: "Hair",
          description: "Brown hair",
          category: "build",
        },
      ],
    });

    const result = ensureLifecycleDefaults(state, TODAY);
    expect(result.appearance[0]!.category).toBe("build");
  });

  it("fills hook but preserves existing thread fields", () => {
    const state = base({
      openThreads: [
        {
          id: "t-existing",
          description: "Find the treasure",
          resolutionHint: "dig it up",
          status: "evolved" as const,
          createdAt: "2025-06-01",
          lastReferencedAt: "2025-07-01",
        },
      ],
    });

    const result = ensureLifecycleDefaults(state, TODAY);
    const thread = result.openThreads[0]!;

    expect(thread.id).toBe("t-existing");
    expect(thread.hook).toBeTruthy();
    expect(thread.resolutionHint).toBe("dig it up");
    expect(thread.status).toBe("evolved");
    expect(thread.createdAt).toBe("2025-06-01");
    expect(thread.lastReferencedAt).toBe("2025-07-01");
  });

  it("derives createdAt from today when fact has no dates", () => {
    const state = base({
      hardFacts: [{ fact: "No dates here", superseded: false }],
    });
    const result = ensureLifecycleDefaults(state, TODAY);
    const fact = result.hardFacts[0]!;
    expect(fact.createdAt).toBe(TODAY);
    expect(fact.establishedAt).toBe(TODAY);
    expect(fact.lastConfirmedAt).toBe(TODAY);
  });

  it("preserves existing fact dates", () => {
    const state = base({
      hardFacts: [
        {
          fact: "Existing fact",
          superseded: false,
          createdAt: "2025-01-01",
          establishedAt: "2025-01-01",
          lastConfirmedAt: "2025-06-01",
        },
      ],
    });
    const result = ensureLifecycleDefaults(state, TODAY);
    const fact = result.hardFacts[0]!;
    expect(fact.createdAt).toBe("2025-01-01");
    expect(fact.establishedAt).toBe("2025-01-01");
    expect(fact.lastConfirmedAt).toBe("2025-06-01");
  });

  it("defaults fact.superseded to false when undefined", () => {
    const state = base({
      hardFacts: [{ fact: "Some fact" } as HardFact],
    });
    const result = ensureLifecycleDefaults(state, TODAY);
    expect(result.hardFacts[0]!.superseded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reconcileLifecycleState - additional edge cases
// ---------------------------------------------------------------------------
describe("reconcileLifecycleState - edge cases", () => {
  it("hydrates fact content (summary, tags) from previous when incoming lacks them", () => {
    const prevFact: HardFact = {
      fact: "Alice likes cats",
      summary: "Alice cat preference",
      tags: ["biographical"],
      superseded: false,
      createdAt: "2025-12-01",
    };
    const previous = base({ hardFacts: [prevFact] });
    const incoming = base({
      hardFacts: [{ fact: "Alice likes cats", superseded: false }],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    expect(result.hardFacts[0]!.summary).toBe("Alice cat preference");
    expect(result.hardFacts[0]!.tags).toEqual(["biographical"]);
  });

  it("uses incoming summary/tags when provided even if previous has them", () => {
    const prevFact: HardFact = {
      fact: "Alice likes cats",
      summary: "old summary",
      tags: ["biographical"],
      superseded: false,
      createdAt: "2025-12-01",
    };
    const previous = base({ hardFacts: [prevFact] });
    const incoming = base({
      hardFacts: [
        {
          fact: "Alice likes cats",
          summary: "new summary",
          tags: ["relational"],
          superseded: false,
        },
      ],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    expect(result.hardFacts[0]!.summary).toBe("new summary");
    expect(result.hardFacts[0]!.tags).toEqual(["relational"]);
  });

  it("uses today for dates when neither incoming nor previous has them", () => {
    const prevFact: HardFact = {
      fact: "New fact",
      superseded: false,
    };
    const previous = base({ hardFacts: [prevFact] });
    const incoming = base({
      hardFacts: [{ fact: "Another fact", superseded: false }],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    // The "Another fact" is new, no match
    const newFact = result.hardFacts.find((f) => f.fact === "Another fact")!;
    expect(newFact.createdAt).toBe(TODAY);
    expect(newFact.establishedAt).toBe(TODAY);
  });

  it("preserves supersededBy from previous fact when archiving", () => {
    const prevFact: HardFact = {
      fact: "Old fact",
      superseded: false,
      supersededBy: "Already set reason",
      createdAt: "2025-01-01",
    };
    const previous = base({ hardFacts: [prevFact] });
    const incoming = base({ hardFacts: [] });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    expect(result.hardFacts[0]!.supersededBy).toBe("Already set reason");
  });

  it("archives thread already marked stale without changing status", () => {
    const prevThread: StoryThread = {
      id: "t-stale",
      description: "Stale thread",
      resolutionHint: "",
      status: "stale",
      createdAt: "2025-05-01",
    };
    const previous = base({ openThreads: [prevThread] });
    const incoming = base({ openThreads: [] });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    expect(result.openThreads[0]!.status).toBe("stale");
    expect(result.openThreads[0]!.closureRationale).toContain(TODAY);
  });

  it("hydrates thread resolutionHint from previous when incoming is empty", () => {
    const prevThread: StoryThread = {
      id: "t-1",
      description: "Find the treasure",
      resolutionHint: "dig it up",
      status: "active",
      createdAt: "2025-10-01",
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
    expect(result.openThreads[0]!.resolutionHint).toBe("dig it up");
  });

  it("preserves evolvedInto from previous thread", () => {
    const prevThread: StoryThread = {
      id: "t-1",
      description: "Old quest",
      resolutionHint: "",
      status: "evolved",
      evolvedInto: "t-2",
      createdAt: "2025-08-01",
    };
    const previous = base({ openThreads: [prevThread] });
    const incoming = base({
      openThreads: [
        {
          id: "t-1",
          description: "Old quest",
          resolutionHint: "",
          status: "evolved",
        },
      ],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    expect(result.openThreads[0]!.evolvedInto).toBe("t-2");
  });

  it("preserves player flag with case-insensitive matching", () => {
    const playerEntity: Entity = {
      id: "e-player",
      name: "Bob",
      description: "",
      isPlayerCharacter: true,
    };
    const previous = base({ entities: [ALICE, playerEntity] });
    const incoming = base({
      entities: [
        {
          id: "e-alice",
          name: "Alice",
          description: "",
          isPlayerCharacter: false,
        },
        { id: "e-bob", name: "bob", description: "", isPlayerCharacter: false },
      ],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    const bob = result.entities.find((e) => e.name.toLowerCase() === "bob");
    expect(bob?.isPlayerCharacter).toBe(true);
  });

  it("returns incoming entities unchanged when previous has no players", () => {
    const nonPlayer: Entity = {
      id: "e-x",
      name: "Xavier",
      description: "",
      isPlayerCharacter: false,
    };
    const previous = base({ entities: [nonPlayer] });
    const incoming = base({
      entities: [
        { id: "e-y", name: "Yara", description: "", isPlayerCharacter: false },
      ],
    });

    const result = reconcileLifecycleState(previous, incoming, TODAY);
    expect(result.entities).toEqual(incoming.entities);
  });
});
