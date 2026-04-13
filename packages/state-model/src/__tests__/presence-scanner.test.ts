import { describe, it, expect } from "vitest";
import { scanPresenceFromAssistantMessage } from "../presence-scanner";
import type { Entity } from "../types";

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
  // -- Replicated from existing tests --

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

  // -- New tests --

  it("returns empty results for empty text", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText: "",
      entities: [AMANDA],
      currentPresentEntityIds: [],
    });

    expect(result.addEntityIds).toHaveLength(0);
    expect(result.removeEntityIds).toHaveLength(0);
  });

  it("skips entities with empty names", () => {
    const noName: Entity = {
      id: "e-noname",
      name: "",
      description: "",
      isPlayerCharacter: false,
    };
    const result = scanPresenceFromAssistantMessage({
      assistantText: "Someone enters the room.",
      entities: [noName],
      currentPresentEntityIds: [],
    });

    expect(result.addEntityIds).toHaveLength(0);
    expect(result.removeEntityIds).toHaveLength(0);
  });

  it("matches on first name alone", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText: "Amanda steps into the room.",
      entities: [AMANDA],
      currentPresentEntityIds: [],
    });

    expect(result.addEntityIds).toContain("e-amanda");
  });

  it("adds multiple entities when both are mentioned and absent", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText:
        "Amanda Campbell and Leo Barnes arrive at the front desk together.",
      entities: [AMANDA, LEO],
      currentPresentEntityIds: [],
    });

    expect(result.addEntityIds).toContain("e-amanda");
    expect(result.addEntityIds).toContain("e-leo");
    expect(result.addEntityIds).toHaveLength(2);
    expect(result.removeEntityIds).toHaveLength(0);
  });

  it("does not re-add an entity already present and not exiting", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText: "Amanda Campbell smiles and adjusts her glasses.",
      entities: [AMANDA],
      currentPresentEntityIds: ["e-amanda"],
    });

    expect(result.addEntityIds).toHaveLength(0);
    expect(result.removeEntityIds).toHaveLength(0);
  });

  describe("exit verb coverage", () => {
    const exitVerbs = [
      "walked out",
      "stepped out",
      "departed",
      "stormed out",
      "slipped out",
    ];

    for (const verb of exitVerbs) {
      it(`detects exit with "${verb}"`, () => {
        const result = scanPresenceFromAssistantMessage({
          assistantText: `Amanda Campbell ${verb} through the door.`,
          entities: [AMANDA],
          currentPresentEntityIds: ["e-amanda"],
        });

        expect(result.removeEntityIds).toContain("e-amanda");
      });
    }
  });

  describe("exit context patterns", () => {
    const contexts = [
      "through the door",
      "toward the hallway",
      "into the stairwell",
      "through the lobby",
    ];

    for (const ctx of contexts) {
      it(`detects exit context "${ctx}"`, () => {
        const result = scanPresenceFromAssistantMessage({
          assistantText: `Amanda Campbell walked out ${ctx}.`,
          entities: [AMANDA],
          currentPresentEntityIds: ["e-amanda"],
        });

        expect(result.removeEntityIds).toContain("e-amanda");
      });
    }
  });

  it("handles entity mentioned in non-exit context, then exiting in a later sentence", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText:
        "Amanda Campbell picks up her bag and checks her phone. Amanda then stepped out through the door without looking back.",
      entities: [AMANDA],
      currentPresentEntityIds: ["e-amanda"],
    });

    expect(result.removeEntityIds).toContain("e-amanda");
  });

  it("matches entity names case-insensitively", () => {
    const result = scanPresenceFromAssistantMessage({
      assistantText: "AMANDA CAMPBELL left the room through the door.",
      entities: [AMANDA],
      currentPresentEntityIds: ["e-amanda"],
    });

    expect(result.removeEntityIds).toContain("e-amanda");
  });

  describe("names with special regex characters", () => {
    it("handles apostrophe in entity name", () => {
      const dArtagnan: Entity = {
        id: "e-dartagnan",
        name: "D'Artagnan",
        description: "",
        isPlayerCharacter: false,
      };
      const result = scanPresenceFromAssistantMessage({
        assistantText: "D'Artagnan appeared in the doorway, looking tired.",
        entities: [dArtagnan],
        currentPresentEntityIds: [],
      });

      expect(result.addEntityIds).toContain("e-dartagnan");
    });
  });

  describe("very short names", () => {
    it("does not match first name shorter than 3 chars for multi-word entity", () => {
      const al: Entity = {
        id: "e-al",
        name: "Al Smith",
        description: "",
        isPlayerCharacter: false,
      };
      // "Al" alone is < 3 chars so short-name matching should not trigger
      // but the full name should still match
      const result = scanPresenceFromAssistantMessage({
        assistantText: "Al Smith walks into the room.",
        entities: [al],
        currentPresentEntityIds: [],
      });

      expect(result.addEntityIds).toContain("e-al");
    });

    it("does not match 'Al' as standalone first name due to length < 3", () => {
      const al: Entity = {
        id: "e-al",
        name: "Al Smith",
        description: "",
        isPlayerCharacter: false,
      };
      const result = scanPresenceFromAssistantMessage({
        assistantText: "Al entered the room carrying a package.",
        entities: [al],
        currentPresentEntityIds: [],
      });

      // Full name "Al Smith" is not in text, first name "Al" is < 3 chars
      // so should not match via first-name alone
      expect(result.addEntityIds).toHaveLength(0);
    });
  });

  describe("negation at boundary", () => {
    it("detects negation within 24-char window before exit verb", () => {
      // "did not" exactly within 24 chars before the verb
      const result = scanPresenceFromAssistantMessage({
        assistantText: "Amanda Campbell did not stepped out through the door.",
        entities: [AMANDA],
        currentPresentEntityIds: ["e-amanda"],
      });

      expect(result.removeEntityIds).toHaveLength(0);
    });

    it("misses negation beyond 24-char window before exit verb", () => {
      // Place negation far enough before the exit verb to exceed the 24-char window
      const result = scanPresenceFromAssistantMessage({
        assistantText:
          "Amanda Campbell was not really thinking about it when she finally walked out through the door.",
        entities: [AMANDA],
        currentPresentEntityIds: ["e-amanda"],
      });

      // Negation is too far from the verb, so exit should be detected
      expect(result.removeEntityIds).toContain("e-amanda");
    });
  });

  describe("multiple exits in same sentence", () => {
    it("detects exit for both entities in separate sentences", () => {
      const result = scanPresenceFromAssistantMessage({
        assistantText:
          "Amanda Campbell exited through the door. Leo Barnes rushed out to the street.",
        entities: [AMANDA, LEO],
        currentPresentEntityIds: ["e-amanda", "e-leo"],
      });

      expect(result.removeEntityIds).toContain("e-amanda");
      expect(result.removeEntityIds).toContain("e-leo");
    });
  });

  describe("names as substrings of other words", () => {
    it("does not match entity name embedded in longer word", () => {
      const art: Entity = {
        id: "e-art",
        name: "Art",
        description: "",
        isPlayerCharacter: false,
      };
      const result = scanPresenceFromAssistantMessage({
        assistantText: "The artisan crafted a beautiful vase in the workshop.",
        entities: [art],
        currentPresentEntityIds: [],
      });

      // "Art" should not match as part of "artisan" due to word boundary
      expect(result.addEntityIds).toHaveLength(0);
    });
  });

  describe("multi-word entity names", () => {
    it("matches full multi-word name", () => {
      const result = scanPresenceFromAssistantMessage({
        assistantText: "Leo Barnes strolled into the cafe looking cheerful.",
        entities: [LEO],
        currentPresentEntityIds: [],
      });

      expect(result.addEntityIds).toContain("e-leo");
    });

    it("matches first name only for multi-word entities (3+ chars)", () => {
      const result = scanPresenceFromAssistantMessage({
        assistantText: "Leo waved from across the room.",
        entities: [LEO],
        currentPresentEntityIds: [],
      });

      expect(result.addEntityIds).toContain("e-leo");
    });
  });

  describe("whitespace-only message", () => {
    it("returns empty results for whitespace-only text", () => {
      const result = scanPresenceFromAssistantMessage({
        assistantText: "   \n  \t  ",
        entities: [AMANDA],
        currentPresentEntityIds: [],
      });

      expect(result.addEntityIds).toHaveLength(0);
      expect(result.removeEntityIds).toHaveLength(0);
    });
  });

  describe("exit without departure context", () => {
    it("does not remove when exit verb has no departure context word", () => {
      const result = scanPresenceFromAssistantMessage({
        assistantText: "Amanda Campbell left her purse on the counter.",
        entities: [AMANDA],
        currentPresentEntityIds: ["e-amanda"],
      });

      expect(result.removeEntityIds).toHaveLength(0);
    });
  });

  describe("simultaneous add and remove", () => {
    it("can add one entity and remove another in same message", () => {
      const result = scanPresenceFromAssistantMessage({
        assistantText:
          "Leo Barnes stepped into the room just as Amanda Campbell rushed out to the street.",
        entities: [AMANDA, LEO],
        currentPresentEntityIds: ["e-amanda"],
      });

      expect(result.addEntityIds).toContain("e-leo");
      expect(result.removeEntityIds).toContain("e-amanda");
    });
  });
});
