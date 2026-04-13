import { describe, it, expect } from "vitest";
import { scanLocationChangesFromAssistantMessage } from "../location-scanner";
import type { Entity, LocationInfo } from "../types";

const FATIMA: Entity = {
  id: "e-fatima",
  name: "Fatima Reyes",
  description: "",
  isPlayerCharacter: false,
};

const ALEX: Entity = {
  id: "e-alex",
  name: "Alex Chen",
  description: "",
  isPlayerCharacter: false,
};

const PLAYER: Entity = {
  id: "e-player",
  name: "Player Character",
  description: "",
  isPlayerCharacter: true,
};

const KITCHEN: LocationInfo = {
  id: "loc-kitchen",
  name: "Kitchen",
  description: "A warm kitchen",
  tags: [],
  atmosphere: "",
  connectedTo: [],
};

const GARDEN: LocationInfo = {
  id: "loc-garden",
  name: "Garden",
  description: "A lush garden",
  tags: [],
  atmosphere: "",
  connectedTo: [],
};

const LIBRARY: LocationInfo = {
  id: "loc-library",
  name: "Library",
  description: "A quiet library",
  tags: [],
  atmosphere: "",
  connectedTo: [],
};

describe("scanLocationChangesFromAssistantMessage", () => {
  it("detects simple movement to a known location", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText: "Fatima headed to the Kitchen to grab a snack.",
      entities: [FATIMA],
      locations: [KITCHEN, GARDEN],
    });

    expect(result.entityMoves).toHaveLength(1);
    expect(result.entityMoves[0]).toEqual({
      entityId: "e-fatima",
      toLocationId: "loc-kitchen",
      toLocationName: "Kitchen",
    });
  });

  it("returns no moves for unknown locations", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText: "Fatima went to the attic to find the old trunk.",
      entities: [FATIMA],
      locations: [KITCHEN, GARDEN],
    });

    expect(result.entityMoves).toHaveLength(0);
  });

  it("matches location names case-insensitively", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText: "Alex walked to the garden quietly.",
      entities: [ALEX],
      locations: [GARDEN],
    });

    expect(result.entityMoves).toHaveLength(1);
    expect(result.entityMoves[0]?.toLocationId).toBe("loc-garden");
  });

  it("detects multiple entity moves in one response", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText:
        "Fatima headed to the Kitchen. Alex strolled to the Garden.",
      entities: [FATIMA, ALEX],
      locations: [KITCHEN, GARDEN],
    });

    expect(result.entityMoves).toHaveLength(2);
    const fatimaMove = result.entityMoves.find(
      (m) => m.entityId === "e-fatima",
    );
    const alexMove = result.entityMoves.find(
      (m) => m.entityId === "e-alex",
    );
    expect(fatimaMove?.toLocationId).toBe("loc-kitchen");
    expect(alexMove?.toLocationId).toBe("loc-garden");
  });

  it("skips negated movement", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText:
        "Fatima didn't go to the Kitchen. She stayed where she was.",
      entities: [FATIMA],
      locations: [KITCHEN],
    });

    expect(result.entityMoves).toHaveLength(0);
  });

  it("skips player character entities", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText: "Player Character headed to the Kitchen.",
      entities: [PLAYER],
      locations: [KITCHEN],
    });

    expect(result.entityMoves).toHaveLength(0);
  });

  it("returns no moves when locations registry is empty", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText: "Fatima headed to the Kitchen.",
      entities: [FATIMA],
      locations: [],
    });

    expect(result.entityMoves).toHaveLength(0);
  });

  it("returns no moves when movement verb has no location match", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText: "Fatima hurried to some unknown place.",
      entities: [FATIMA],
      locations: [KITCHEN, GARDEN],
    });

    expect(result.entityMoves).toHaveLength(0);
  });

  it("matches location as word-boundary substring", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText:
        "Fatima entered the old Kitchen area and started cooking.",
      entities: [FATIMA],
      locations: [KITCHEN],
    });

    expect(result.entityMoves).toHaveLength(1);
    expect(result.entityMoves[0]?.toLocationId).toBe("loc-kitchen");
  });

  it("keeps the last move when an entity moves multiple times", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText:
        "Fatima walked to the Kitchen. Then Fatima went to the Garden.",
      entities: [FATIMA],
      locations: [KITCHEN, GARDEN],
    });

    expect(result.entityMoves).toHaveLength(1);
    expect(result.entityMoves[0]?.toLocationId).toBe("loc-garden");
  });

  it("detects first-name-only mentions", () => {
    const result = scanLocationChangesFromAssistantMessage({
      assistantText: "Fatima walked to the Library.",
      entities: [FATIMA],
      locations: [LIBRARY],
    });

    expect(result.entityMoves).toHaveLength(1);
    expect(result.entityMoves[0]?.toLocationId).toBe("loc-library");
  });
});
