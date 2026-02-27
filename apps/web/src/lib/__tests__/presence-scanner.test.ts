import { describe, it, expect } from "vitest";
import { scanPresenceFromAssistantMessage } from "../presence-scanner.js";
import type { Entity } from "../story-state-model.js";

const AMANDA: Entity = {
  id: "e-amanda",
  name: "Amanda Campbell",
  description: "",
  isPlayerCharacter: false,
};

const LEO: Entity = {
  id: "e-leo",
  name: "Leo Barnes",
  description: "",
  isPlayerCharacter: false,
};

const PLAYER: Entity = {
  id: "e-player",
  name: "Player Character",
  description: "",
  isPlayerCharacter: true,
};

describe("scanPresenceFromAssistantMessage", () => {
  it("adds an entity when their name is mentioned and they are not present", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText:
        "Amanda Campbell steps into the room and takes the seat by the window.",
      entities: [AMANDA],
      currentPresentEntityIds: [],
    });

    expect(result.addEntityIds).toContain("e-amanda");
    expect(result.removeEntityIds).toHaveLength(0);
  });

  it("never auto-adds player-character entities", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText: "Player Character enters the scene.",
      entities: [PLAYER],
      currentPresentEntityIds: [],
    });

    expect(result.addEntityIds).toHaveLength(0);
    expect(result.removeEntityIds).toHaveLength(0);
  });

  it("removes an entity only when exit is explicit and context indicates departure", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText:
        "Amanda Campbell hurries out the door and exits to the street.",
      entities: [AMANDA],
      currentPresentEntityIds: ["e-amanda"],
    });

    expect(result.removeEntityIds).toContain("e-amanda");
  });

  it("does not remove on negated exit phrasing", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText: "Amanda Campbell did not leave the room after all.",
      entities: [AMANDA],
      currentPresentEntityIds: ["e-amanda"],
    });

    expect(result.removeEntityIds).toHaveLength(0);
  });

  it("does not remove when wording is non-departure context", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText:
        "Amanda Campbell left a note on the desk and sat back down.",
      entities: [AMANDA],
      currentPresentEntityIds: ["e-amanda"],
    });

    expect(result.removeEntityIds).toHaveLength(0);
  });

  it("does not remove Amanda when only another entity is described leaving", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText: "Leo Barnes rushes out toward the stairwell.",
      entities: [AMANDA, LEO],
      currentPresentEntityIds: ["e-amanda", "e-leo"],
    });

    expect(result.removeEntityIds).toContain("e-leo");
    expect(result.removeEntityIds).not.toContain("e-amanda");
  });
});
