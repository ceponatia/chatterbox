import { describe, it, expect } from "vitest";
import {
  applyStructuralRepairs,
  validateStructuralIntegrity,
} from "../index.js";
import {
  emptyStructuredState,
  type Entity,
  type StructuredStoryState,
} from "../types.js";

function makeEntity(id: string, name: string): Entity {
  return {
    id,
    name,
    description: "",
    isPlayerCharacter: false,
  };
}

function baseState(
  overrides: Partial<StructuredStoryState> = {},
): StructuredStoryState {
  return {
    ...emptyStructuredState(),
    ...overrides,
  };
}

describe("validateStructuralIntegrity", () => {
  it("returns no issues for a clean state", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice"), makeEntity("e-bob", "Bob")],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-bob",
          description: "Friends",
          details: [],
        },
      ],
      appearance: [
        {
          entityId: "e-alice",
          attribute: "hair",
          description: "brown",
        },
      ],
      demeanor: [{ entityId: "e-bob", mood: "calm", energy: "steady" }],
      hardFacts: [
        {
          fact: "Alice moved to Paris.",
          superseded: true,
          supersededBy: "london",
        },
        {
          fact: "Alice moved to London last year.",
          superseded: false,
        },
      ],
    });

    const report = validateStructuralIntegrity(state);

    expect(report.issues).toEqual([]);
    expect(report.autoFixCount).toBe(0);
  });

  it("detects orphaned entity refs in relationships", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice")],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-missing",
          description: "Unknown",
          details: [],
        },
      ],
    });

    const report = validateStructuralIntegrity(state);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      kind: "orphaned_entity_ref",
      severity: "error",
      section: "relationships",
      autoFixable: true,
    });
  });

  it("detects orphaned entity refs in appearance", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice")],
      appearance: [
        {
          entityId: "e-missing",
          attribute: "eyes",
          description: "green",
        },
      ],
    });

    const report = validateStructuralIntegrity(state);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      kind: "orphaned_entity_ref",
      severity: "error",
      section: "appearance",
      autoFixable: true,
    });
  });

  it("detects orphaned entity refs in demeanor", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice")],
      demeanor: [{ entityId: "e-missing", mood: "tense", energy: "high" }],
    });

    const report = validateStructuralIntegrity(state);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      kind: "orphaned_entity_ref",
      severity: "error",
      section: "demeanor",
      autoFixable: true,
    });
  });

  it("detects self-referencing relationships", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice")],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-alice",
          description: "Self",
          details: [],
        },
      ],
    });

    const report = validateStructuralIntegrity(state);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      kind: "self_referencing_relationship",
      severity: "warning",
      section: "relationships",
      autoFixable: true,
    });
  });

  it("detects duplicate entity IDs", () => {
    const state = baseState({
      entities: [makeEntity("e-dup", "Alice"), makeEntity("e-dup", "Bob")],
    });

    const report = validateStructuralIntegrity(state);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      kind: "duplicate_entity_id",
      severity: "error",
      section: "cast",
      autoFixable: false,
    });
  });

  it("detects dangling supersededBy as a warning", () => {
    const state = baseState({
      hardFacts: [
        {
          fact: "Alice moved to Paris.",
          superseded: true,
          supersededBy: "london",
        },
        {
          fact: "Alice likes tea.",
          superseded: false,
        },
      ],
    });

    const report = validateStructuralIntegrity(state);

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      kind: "dangling_superseded_by",
      severity: "warning",
      section: "hardFacts",
      autoFixable: false,
    });
  });
});

describe("applyStructuralRepairs", () => {
  it("removes orphaned refs", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice")],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-missing",
          description: "Unknown",
          details: [],
        },
      ],
      appearance: [
        {
          entityId: "e-missing",
          attribute: "eyes",
          description: "green",
        },
      ],
      demeanor: [{ entityId: "e-missing", mood: "tense", energy: "high" }],
    });
    const report = validateStructuralIntegrity(state);

    const result = applyStructuralRepairs(state, report);

    expect(result.state.relationships).toEqual([]);
    expect(result.state.appearance).toEqual([]);
    expect(result.state.demeanor).toEqual([]);
    expect(result.applied).toHaveLength(3);
    expect(result.skipped).toEqual([]);
  });

  it("removes self-referencing relationships", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice")],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-alice",
          description: "Self",
          details: [],
        },
      ],
    });
    const report = validateStructuralIntegrity(state);

    const result = applyStructuralRepairs(state, report);

    expect(result.state.relationships).toEqual([]);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]!.kind).toBe("self_referencing_relationship");
  });

  it("does not mutate the input state", () => {
    const state = baseState({
      entities: [makeEntity("e-alice", "Alice")],
      relationships: [
        {
          fromEntityId: "e-alice",
          toEntityId: "e-alice",
          description: "Self",
          details: [],
        },
      ],
      appearance: [
        {
          entityId: "e-missing",
          attribute: "eyes",
          description: "green",
        },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(state)) as StructuredStoryState;
    const report = validateStructuralIntegrity(state);

    const result = applyStructuralRepairs(state, report);

    expect(state).toEqual(snapshot);
    expect(result.state).not.toBe(state);
  });

  it("skips non-auto-fixable issues", () => {
    const state = baseState({
      entities: [makeEntity("e-dup", "Alice"), makeEntity("e-dup", "Bob")],
      hardFacts: [
        {
          fact: "Alice moved to Paris.",
          superseded: true,
          supersededBy: "london",
        },
        {
          fact: "Alice likes tea.",
          superseded: false,
        },
      ],
    });
    const report = validateStructuralIntegrity(state);

    const result = applyStructuralRepairs(state, report);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(result.state.entities).toEqual(state.entities);
    expect(result.state.hardFacts).toEqual(state.hardFacts);
  });
});
