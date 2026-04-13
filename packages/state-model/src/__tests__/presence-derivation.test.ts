import { describe, it, expect } from "vitest";
import { derivePresenceFromLocations } from "../presence-derivation";
import type { Entity } from "../types";

const PLAYER: Entity = {
  id: "e-player",
  name: "Player Character",
  description: "",
  isPlayerCharacter: true,
  locationId: "loc-kitchen",
};

const FATIMA: Entity = {
  id: "e-fatima",
  name: "Fatima Reyes",
  description: "",
  isPlayerCharacter: false,
  locationId: "loc-kitchen",
};

const ALEX: Entity = {
  id: "e-alex",
  name: "Alex Chen",
  description: "",
  isPlayerCharacter: false,
  locationId: "loc-garden",
};

const LEO: Entity = {
  id: "e-leo",
  name: "Leo Barnes",
  description: "",
  isPlayerCharacter: false,
  locationId: "loc-library",
};

describe("derivePresenceFromLocations", () => {
  it("includes entities co-located with the scene", () => {
    const result = derivePresenceFromLocations({
      entities: [PLAYER, FATIMA, ALEX],
      sceneLocationId: "loc-kitchen",
    });

    expect(result).toContain("e-player");
    expect(result).toContain("e-fatima");
    expect(result).not.toContain("e-alex");
  });

  it("excludes entities at other locations", () => {
    const result = derivePresenceFromLocations({
      entities: [FATIMA, ALEX, LEO],
      sceneLocationId: "loc-kitchen",
    });

    expect(result).toContain("e-fatima");
    expect(result).not.toContain("e-alex");
    expect(result).not.toContain("e-leo");
  });

  it("adds a non-co-located entity via manual override", () => {
    const result = derivePresenceFromLocations({
      entities: [FATIMA, ALEX],
      sceneLocationId: "loc-kitchen",
      manualOverrides: {
        addEntityIds: ["e-alex"],
        removeEntityIds: [],
      },
    });

    expect(result).toContain("e-fatima");
    expect(result).toContain("e-alex");
  });

  it("removes a co-located entity via manual override", () => {
    const result = derivePresenceFromLocations({
      entities: [FATIMA, ALEX],
      sceneLocationId: "loc-kitchen",
      manualOverrides: {
        addEntityIds: [],
        removeEntityIds: ["e-fatima"],
      },
    });

    expect(result).not.toContain("e-fatima");
  });

  it("always includes the player character even at a different location", () => {
    const playerElsewhere: Entity = {
      ...PLAYER,
      locationId: "loc-garden",
    };

    const result = derivePresenceFromLocations({
      entities: [playerElsewhere, FATIMA],
      sceneLocationId: "loc-kitchen",
    });

    expect(result).toContain("e-player");
    expect(result).toContain("e-fatima");
  });

  it("returns empty when no entities exist", () => {
    const result = derivePresenceFromLocations({
      entities: [],
      sceneLocationId: "loc-kitchen",
    });

    expect(result).toHaveLength(0);
  });

  it("returns only player plus manual adds when no entities match the scene", () => {
    const result = derivePresenceFromLocations({
      entities: [PLAYER, ALEX, LEO],
      sceneLocationId: "loc-kitchen",
      manualOverrides: {
        addEntityIds: ["e-leo"],
        removeEntityIds: [],
      },
    });

    expect(result).toContain("e-player");
    expect(result).toContain("e-leo");
    expect(result).not.toContain("e-alex");
  });
});
