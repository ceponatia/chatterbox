import { describe, it, expect } from "vitest";
import {
  resolveEntityName,
  findEntityByName,
  findOrCreateEntity,
  reconcileEntities,
  remapEntityIds,
} from "../entities";
import { emptyStructuredState } from "../types";
import type { Entity } from "../types";

function makeEntity(
  id: string,
  name: string,
  isPlayerCharacter = false,
): Entity {
  return { id, name, description: "", isPlayerCharacter };
}

describe("resolveEntityName", () => {
  const entities = [makeEntity("e-1", "Amanda"), makeEntity("e-2", "Brian")];

  it("returns name for valid ID", () => {
    expect(resolveEntityName(entities, "e-1")).toBe("Amanda");
  });

  it("returns raw ID for unknown ID", () => {
    expect(resolveEntityName(entities, "e-999")).toBe("e-999");
  });
});

describe("findEntityByName", () => {
  const entities = [
    makeEntity("e-1", "Amanda Campbell"),
    makeEntity("e-2", "Brian Lee"),
    makeEntity("e-3", "Campbell Jones"),
  ];

  it("exact match (case-insensitive)", () => {
    expect(findEntityByName(entities, "amanda campbell")?.id).toBe("e-1");
  });

  it("partial token match finds unique result", () => {
    expect(findEntityByName(entities, "Amanda")?.id).toBe("e-1");
  });

  it("returns undefined for ambiguous partial", () => {
    // "Campbell" matches both "Amanda Campbell" and "Campbell Jones"
    expect(findEntityByName(entities, "Campbell")).toBeUndefined();
  });

  it("returns undefined for no match", () => {
    expect(findEntityByName(entities, "Zoe")).toBeUndefined();
  });
});

describe("findOrCreateEntity", () => {
  it("returns existing when found", () => {
    const entities = [makeEntity("e-1", "Amanda")];
    const result = findOrCreateEntity(entities, "Amanda");
    expect(result.id).toBe("e-1");
    expect(entities).toHaveLength(1);
  });

  it("creates new and pushes to array when not found", () => {
    const entities = [makeEntity("e-1", "Amanda")];
    const result = findOrCreateEntity(entities, "Brian");
    expect(result.name).toBe("Brian");
    expect(result.id).toBeTruthy();
    expect(result.id).not.toBe("e-1");
    expect(entities).toHaveLength(2);
  });
});

describe("reconcileEntities", () => {
  it("preserves existing UUIDs on name match", () => {
    const existing = [makeEntity("e-1", "Amanda")];
    const incoming = [makeEntity("x-1", "Amanda")];
    const { entities } = reconcileEntities(existing, incoming);
    expect(entities.find((e) => e.name === "Amanda")?.id).toBe("e-1");
  });

  it("returns idRemap when incoming IDs differ from existing", () => {
    const existing = [makeEntity("e-1", "Amanda")];
    const incoming = [makeEntity("x-1", "Amanda")];
    const { idRemap } = reconcileEntities(existing, incoming);
    expect(idRemap["x-1"]).toBe("e-1");
  });

  it("deduplicates by normalized name", () => {
    const existing: Entity[] = [];
    const incoming = [makeEntity("x-1", "Amanda"), makeEntity("x-2", "amanda")];
    const { entities } = reconcileEntities(existing, incoming);
    const amandas = entities.filter((e) => e.name.toLowerCase() === "amanda");
    expect(amandas).toHaveLength(1);
  });

  it("keeps unmatched existing entities", () => {
    const existing = [makeEntity("e-1", "Amanda"), makeEntity("e-2", "Brian")];
    const incoming = [makeEntity("x-1", "Amanda")];
    const { entities } = reconcileEntities(existing, incoming);
    expect(entities.find((e) => e.name === "Brian")?.id).toBe("e-2");
    expect(entities).toHaveLength(2);
  });
});

describe("remapEntityIds", () => {
  it("remaps relationship, appearance, scene, demeanor entity IDs", () => {
    const state = {
      ...emptyStructuredState(),
      relationships: [
        {
          fromEntityId: "old-1",
          toEntityId: "old-2",
          description: "",
          details: [],
        },
      ],
      appearance: [
        { entityId: "old-1", attribute: "eyes", description: "blue" },
      ],
      scene: {
        location: "park",
        presentEntityIds: ["old-1", "old-2"],
        atmosphere: "",
      },
      demeanor: [{ entityId: "old-2", mood: "calm", energy: "low" }],
    };

    const remap = { "old-1": "new-1", "old-2": "new-2" };
    const result = remapEntityIds(state, remap);

    expect(result.relationships[0]!.fromEntityId).toBe("new-1");
    expect(result.relationships[0]!.toEntityId).toBe("new-2");
    expect(result.appearance[0]!.entityId).toBe("new-1");
    expect(result.scene.presentEntityIds).toEqual(["new-1", "new-2"]);
    expect(result.demeanor[0]!.entityId).toBe("new-2");
  });

  it("returns state unchanged when remap is empty", () => {
    const state = emptyStructuredState();
    const result = remapEntityIds(state, {});
    expect(result).toBe(state); // same reference
  });

  it("leaves IDs unchanged when not in remap", () => {
    const state = {
      ...emptyStructuredState(),
      relationships: [
        {
          fromEntityId: "keep-1",
          toEntityId: "keep-2",
          description: "",
          details: [],
        },
      ],
      appearance: [
        { entityId: "keep-1", attribute: "eyes", description: "blue" },
      ],
      scene: {
        location: "park",
        presentEntityIds: ["keep-1"],
        atmosphere: "",
      },
      demeanor: [{ entityId: "keep-2", mood: "calm", energy: "low" }],
    };

    const remap = { "other-id": "new-id" };
    const result = remapEntityIds(state, remap);

    expect(result.relationships[0]!.fromEntityId).toBe("keep-1");
    expect(result.relationships[0]!.toEntityId).toBe("keep-2");
    expect(result.appearance[0]!.entityId).toBe("keep-1");
    expect(result.scene.presentEntityIds).toEqual(["keep-1"]);
    expect(result.demeanor[0]!.entityId).toBe("keep-2");
  });
});

describe("reconcileEntities - additional edge cases", () => {
  it("deduplicates by normalized name (case-insensitive)", () => {
    const existing: Entity[] = [];
    const incoming = [
      makeEntity("x-1", "Amanda Campbell"),
      makeEntity("x-2", "amanda campbell"),
    ];
    const { entities } = reconcileEntities(existing, incoming);
    const amandas = entities.filter(
      (e) => e.name.toLowerCase().trim() === "amanda campbell",
    );
    expect(amandas).toHaveLength(1);
  });

  it("updates description from incoming when matched", () => {
    const existing = [makeEntity("e-1", "Amanda")];
    existing[0]!.description = "Old description";
    const incoming = [
      { ...makeEntity("x-1", "Amanda"), description: "New description" },
    ];
    const { entities } = reconcileEntities(existing, incoming);
    expect(entities.find((e) => e.name === "Amanda")?.description).toBe(
      "New description",
    );
  });

  it("does not create remap when IDs already match", () => {
    const existing = [makeEntity("e-1", "Amanda")];
    const incoming = [makeEntity("e-1", "Amanda")];
    const { idRemap } = reconcileEntities(existing, incoming);
    expect(Object.keys(idRemap)).toHaveLength(0);
  });

  it("handles empty existing and incoming arrays", () => {
    const { entities, idRemap } = reconcileEntities([], []);
    expect(entities).toHaveLength(0);
    expect(Object.keys(idRemap)).toHaveLength(0);
  });

  it("preserves isPlayerCharacter from incoming", () => {
    const existing = [makeEntity("e-1", "Amanda")];
    const incoming = [
      { ...makeEntity("x-1", "Amanda"), isPlayerCharacter: true },
    ];
    const { entities } = reconcileEntities(existing, incoming);
    expect(entities.find((e) => e.name === "Amanda")?.isPlayerCharacter).toBe(
      true,
    );
  });
});

describe("findEntityByName - additional edge cases", () => {
  it("finds entity with leading/trailing whitespace in query", () => {
    const entities = [makeEntity("e-1", "Amanda Campbell")];
    expect(findEntityByName(entities, "  Amanda Campbell  ")?.id).toBe("e-1");
  });

  it("matches when entity name tokens are subset of query tokens", () => {
    const entities = [makeEntity("e-1", "Amanda")];
    // "Amanda" tokens are subset of "Amanda Campbell" tokens
    expect(findEntityByName(entities, "Amanda Campbell")?.id).toBe("e-1");
  });

  it("returns undefined for empty entities array", () => {
    expect(findEntityByName([], "Amanda")).toBeUndefined();
  });
});

describe("findOrCreateEntity - additional edge cases", () => {
  it("sets isPlayerCharacter flag on creation", () => {
    const entities: Entity[] = [];
    const result = findOrCreateEntity(entities, "Hero", true);
    expect(result.isPlayerCharacter).toBe(true);
    expect(entities).toHaveLength(1);
  });

  it("trims name on creation", () => {
    const entities: Entity[] = [];
    const result = findOrCreateEntity(entities, "  Amanda  ");
    expect(result.name).toBe("Amanda");
  });
});
