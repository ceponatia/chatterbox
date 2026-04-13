import { describe, it, expect } from "vitest";
import { parseMarkdownToStructured } from "../parser";
import { emptyStructuredState } from "../types";

describe("parseMarkdownToStructured", () => {
  describe("empty/blank input", () => {
    it("returns emptyStructuredState for empty string", () => {
      const result = parseMarkdownToStructured("");
      expect(result).toEqual(emptyStructuredState());
    });

    it("returns emptyStructuredState for whitespace-only input", () => {
      const result = parseMarkdownToStructured("   \n  ");
      expect(result).toEqual(emptyStructuredState());
    });
  });

  describe("cast parsing", () => {
    it("parses cast entries with player character flag", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda Campbell** -- Main NPC. Runs the coffee shop.",
        "- **Jake Torres** -- Regular customer. [player character]",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(2);

      const amanda = result.entities.find((e) => e.name === "Amanda Campbell");
      expect(amanda).toBeDefined();
      expect(amanda!.isPlayerCharacter).toBe(false);
      expect(amanda!.description).toContain("Main NPC");

      const jake = result.entities.find((e) => e.name === "Jake Torres");
      expect(jake).toBeDefined();
      expect(jake!.isPlayerCharacter).toBe(true);
      expect(jake!.description).toContain("Regular customer");
    });
  });

  describe("relationship parsing", () => {
    it("parses relationships with details and inferred tone", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "- **Jake** -- Customer",
        "",
        "## Relationships",
        "",
        "- **Amanda > Jake**: Friendly regular customer",
        "  - Enjoys chatting during slow hours",
        "  - Knows his usual order",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.relationships).toHaveLength(1);

      const rel = result.relationships[0]!;
      const amanda = result.entities.find((e) => e.name === "Amanda");
      const jake = result.entities.find((e) => e.name === "Jake");

      expect(rel.fromEntityId).toBe(amanda!.id);
      expect(rel.toEntityId).toBe(jake!.id);
      expect(rel.description).toBe("Friendly regular customer");
      expect(rel.details).toHaveLength(2);
      expect(rel.details).toContain("Enjoys chatting during slow hours");
      expect(rel.details).toContain("Knows his usual order");
      expect(rel.tone).toBeDefined();
      // "Friendly" should infer warm tone
      expect(rel.tone).toBe("warm");
    });
  });

  describe("appearance parsing", () => {
    it("parses flat appearance format", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "",
        "## Appearance",
        "",
        "- **Amanda - Eyes**: Warm brown with laugh lines",
        "- **Amanda - Hair**: Dark brown, shoulder length",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.appearance).toHaveLength(2);

      const eyes = result.appearance.find((a) => a.attribute === "Eyes");
      const hair = result.appearance.find((a) => a.attribute === "Hair");
      const amanda = result.entities.find((e) => e.name === "Amanda");

      expect(eyes).toBeDefined();
      expect(eyes!.entityId).toBe(amanda!.id);
      expect(eyes!.description).toBe("Warm brown with laugh lines");
      expect(eyes!.category).toBe("face");

      expect(hair).toBeDefined();
      expect(hair!.entityId).toBe(amanda!.id);
      expect(hair!.description).toBe("Dark brown, shoulder length");
      expect(hair!.category).toBe("hair");
    });

    it("parses hierarchical Characters format", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "",
        "## Characters",
        "",
        "### Amanda",
        "",
        "#### Appearance",
        "",
        "- **Eyes**: Warm brown with laugh lines",
        "- **Hair**: Dark brown, shoulder length",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.appearance).toHaveLength(2);

      const eyes = result.appearance.find((a) => a.attribute === "Eyes");
      const hair = result.appearance.find((a) => a.attribute === "Hair");
      const amanda = result.entities.find((e) => e.name === "Amanda");

      expect(eyes).toBeDefined();
      expect(eyes!.entityId).toBe(amanda!.id);
      expect(eyes!.description).toBe("Warm brown with laugh lines");
      expect(eyes!.category).toBe("face");

      expect(hair).toBeDefined();
      expect(hair!.entityId).toBe(amanda!.id);
      expect(hair!.description).toBe("Dark brown, shoulder length");
      expect(hair!.category).toBe("hair");
    });
  });

  describe("scene parsing", () => {
    it("parses scene with location, presence, and atmosphere", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "- **Jake** -- Customer",
        "",
        "## Scene",
        "",
        "- **Where/When**: The coffee shop, late afternoon",
        "- **Who is present**: Amanda, Jake",
        "- **Atmosphere**: Warm and relaxed",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.scene.location).toBe("The coffee shop, late afternoon");
      expect(result.scene.atmosphere).toBe("Warm and relaxed");
      expect(result.scene.presentEntityIds).toHaveLength(2);

      const amanda = result.entities.find((e) => e.name === "Amanda");
      const jake = result.entities.find((e) => e.name === "Jake");
      expect(result.scene.presentEntityIds).toContain(amanda!.id);
      expect(result.scene.presentEntityIds).toContain(jake!.id);
    });
  });

  describe("open threads parsing", () => {
    it("parses threads with resolution hints and timestamps", () => {
      const md = [
        "## Open Threads",
        "",
        "- Jake promised to bring Amanda a book recommendation (resolves when: Jake brings the book) (added: 2026-01-10)",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.openThreads).toHaveLength(1);
      const thread = result.openThreads[0]!;
      expect(thread.description).toBe(
        "Jake promised to bring Amanda a book recommendation",
      );
      expect(thread.resolutionHint).toBe("Jake brings the book");
      expect(thread.createdAt).toBe("2026-01-10");
      expect(thread.id).toBeTruthy();
      expect(thread.hook).toBeTruthy();
      expect(thread.status).toBe("active");
    });
  });

  describe("hard facts parsing", () => {
    it("parses facts with timestamps and infers tags and summary", () => {
      const md = [
        "## Hard Facts (do not contradict these)",
        "",
        "- Amanda has worked at the coffee shop for 3 years (added: 2026-01-05)",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.hardFacts).toHaveLength(1);
      const fact = result.hardFacts[0]!;
      expect(fact.fact).toBe(
        "Amanda has worked at the coffee shop for 3 years",
      );
      expect(fact.establishedAt).toBe("2026-01-05");
      expect(fact.createdAt).toBe("2026-01-05");
      expect(fact.superseded).toBe(false);
      expect(fact.tags).toBeDefined();
      expect(fact.tags!.length).toBeGreaterThan(0);
      expect(fact.summary).toBeTruthy();
    });
  });

  describe("custom sections", () => {
    it("preserves unrecognized sections as custom", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "",
        "## Some Custom Section",
        "",
        "This is custom content that should be preserved.",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.custom).toHaveLength(1);
      expect(result.custom[0]!.heading).toBe("Some Custom Section");
      expect(result.custom[0]!.content).toBe(
        "This is custom content that should be preserved.",
      );
    });
  });

  describe("full roundtrip integration", () => {
    it("parses a complete markdown document with all sections", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda Campbell** -- Main NPC. Runs a cozy coffee shop downtown.",
        "- **Jake Torres** -- Loyal regular. [player character]",
        "",
        "## Relationships",
        "",
        "- **Amanda Campbell > Jake Torres**: Friendly regular customer who brightens her mornings",
        "  - Always orders a double espresso",
        "  - They bonded over a shared love of mystery novels",
        "",
        "## Characters",
        "",
        "### Amanda Campbell",
        "",
        "#### Appearance",
        "",
        "- **Eyes**: Warm brown with laugh lines",
        "- **Hair**: Dark brown, shoulder length, usually in a loose bun",
        "- **Build**: Average height, sturdy frame",
        "",
        "## Scene",
        "",
        "- **Where/When**: The coffee shop, late afternoon",
        "- **Who is present**: Amanda Campbell, Jake Torres",
        "- **Atmosphere**: Warm and relaxed, the after-lunch lull",
        "",
        "## Current Demeanor",
        "",
        "- **Amanda Campbell's mood**: Cheerful but a bit tired",
        "- **Energy between them**: Easy and comfortable",
        "",
        "## Open Threads",
        "",
        "- Jake promised to bring Amanda a book recommendation (resolves when: Jake brings the book) (added: 2026-01-10)",
        "- Amanda mentioned she might close the shop early on Friday (added: 2026-01-12)",
        "",
        "## Hard Facts (do not contradict these)",
        "",
        "- Amanda has worked at the coffee shop for 3 years (added: 2026-01-05)",
        "- Jake is a freelance writer who works remotely (added: 2026-01-05)",
        "",
        "## Style",
        "",
        "- Warm, conversational tone",
        "- Include sensory details about the coffee shop",
        "",
        "## Special Rules",
        "",
        "Always describe the smell of coffee in the opening line.",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      // Cast
      expect(result.entities).toHaveLength(2);
      const amanda = result.entities.find((e) => e.name === "Amanda Campbell")!;
      const jake = result.entities.find((e) => e.name === "Jake Torres")!;
      expect(amanda).toBeDefined();
      expect(jake).toBeDefined();
      expect(amanda.isPlayerCharacter).toBe(false);
      expect(jake.isPlayerCharacter).toBe(true);

      // Relationships
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0]!.fromEntityId).toBe(amanda.id);
      expect(result.relationships[0]!.toEntityId).toBe(jake.id);
      expect(result.relationships[0]!.details).toHaveLength(2);

      // Appearance
      expect(result.appearance).toHaveLength(3);
      expect(result.appearance.every((a) => a.entityId === amanda.id)).toBe(
        true,
      );

      // Scene
      expect(result.scene.location).toBe("The coffee shop, late afternoon");
      expect(result.scene.presentEntityIds).toContain(amanda.id);
      expect(result.scene.presentEntityIds).toContain(jake.id);
      expect(result.scene.atmosphere).toContain("Warm and relaxed");

      // Demeanor
      expect(result.demeanor).toHaveLength(1);
      expect(result.demeanor[0]!.entityId).toBe(amanda.id);
      expect(result.demeanor[0]!.mood).toContain("Cheerful");
      expect(result.demeanor[0]!.energy).toContain("Easy and comfortable");

      // Threads
      expect(result.openThreads).toHaveLength(2);
      expect(result.openThreads[0]!.status).toBe("active");
      expect(result.openThreads[1]!.status).toBe("active");

      // Facts
      expect(result.hardFacts).toHaveLength(2);
      expect(result.hardFacts[0]!.superseded).toBe(false);
      expect(result.hardFacts[1]!.superseded).toBe(false);

      // Style
      expect(result.style).toHaveLength(2);
      expect(result.style).toContain("Warm, conversational tone");

      // Custom
      expect(result.custom).toHaveLength(1);
      expect(result.custom[0]!.heading).toBe("Special Rules");
    });
  });

  describe("template placeholders", () => {
    it("skips {{ user }} and {{ char }} as entity names in cast", () => {
      const md = [
        "## Cast",
        "",
        "- **{{ user }}** -- The player",
        "- **{{ char }}** -- The main NPC",
        "- **Amanda** -- Barista",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      // Template placeholders should be filtered out
      expect(
        result.entities.find((e) => e.name.includes("{{")),
      ).toBeUndefined();
      expect(result.entities.find((e) => e.name === "Amanda")).toBeDefined();
    });

    it("skips {{ USER }} case-insensitively", () => {
      const md = [
        "## Cast",
        "",
        "- **{{  USER  }}** -- The player",
        "- **Amanda** -- Barista",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(
        result.entities.find((e) => e.name.includes("USER")),
      ).toBeUndefined();
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.name).toBe("Amanda");
    });
  });

  describe("sections in different orders", () => {
    it("parses when scene comes before cast", () => {
      const md = [
        "## Scene",
        "",
        "- **Where/When**: The park, noon",
        "- **Who is present**: Amanda",
        "- **Atmosphere**: Sunny",
        "",
        "## Cast",
        "",
        "- **Amanda** -- Jogger",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.name).toBe("Amanda");
      expect(result.scene.location).toBe("The park, noon");
      expect(result.scene.atmosphere).toBe("Sunny");
      expect(result.scene.presentEntityIds).toHaveLength(1);
    });

    it("parses when facts come before threads", () => {
      const md = [
        "## Hard Facts",
        "",
        "- The house is old (added: 2026-02-01)",
        "",
        "## Open Threads",
        "",
        "- Find the key (added: 2026-02-02)",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.hardFacts).toHaveLength(1);
      expect(result.hardFacts[0]!.fact).toBe("The house is old");
      expect(result.openThreads).toHaveLength(1);
      expect(result.openThreads[0]!.description).toBe("Find the key");
    });
  });

  describe("partial markdown (missing sections)", () => {
    it("handles markdown with only cast section", () => {
      const md = ["## Cast", "", "- **Amanda** -- Barista"].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(1);
      expect(result.relationships).toHaveLength(0);
      expect(result.appearance).toHaveLength(0);
      expect(result.openThreads).toHaveLength(0);
      expect(result.hardFacts).toHaveLength(0);
      expect(result.style).toHaveLength(0);
      expect(result.scene.location).toBe("");
    });

    it("handles markdown with only scene section", () => {
      const md = [
        "## Scene",
        "",
        "- **Where/When**: A dark alley at midnight",
        "- **Atmosphere**: Tense",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.scene.location).toBe("A dark alley at midnight");
      expect(result.scene.atmosphere).toBe("Tense");
      expect(result.entities).toHaveLength(0);
    });

    it("handles markdown with only style section", () => {
      const md = ["## Style", "", "- Dark and moody", "- Terse dialogue"].join(
        "\n",
      );

      const result = parseMarkdownToStructured(md);

      expect(result.style).toHaveLength(2);
      expect(result.style).toContain("Dark and moody");
    });
  });

  describe("empty cast section", () => {
    it("parses empty cast section without error", () => {
      const md = [
        "## Cast",
        "",
        "",
        "## Scene",
        "",
        "- **Where/When**: A room",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(0);
      expect(result.scene.location).toBe("A room");
    });
  });

  describe("multiple entities with relationships", () => {
    it("parses three entities with cross-references", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "- **Jake** -- Customer",
        "- **Leo** -- Cook",
        "",
        "## Relationships",
        "",
        "- **Amanda > Jake**: Friendly regular",
        "- **Amanda > Leo**: Coworkers",
        "- **Jake > Leo**: Acquaintances",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(3);
      expect(result.relationships).toHaveLength(3);

      const amanda = result.entities.find((e) => e.name === "Amanda")!;
      const jake = result.entities.find((e) => e.name === "Jake")!;
      const leo = result.entities.find((e) => e.name === "Leo")!;

      const amandaJake = result.relationships.find(
        (r) => r.fromEntityId === amanda.id && r.toEntityId === jake.id,
      );
      expect(amandaJake).toBeDefined();
      expect(amandaJake!.description).toBe("Friendly regular");

      const jakeLeo = result.relationships.find(
        (r) => r.fromEntityId === jake.id && r.toEntityId === leo.id,
      );
      expect(jakeLeo).toBeDefined();
    });
  });

  describe("scene with location resolution", () => {
    it("resolves scene locationId from matching locations section", () => {
      const md = [
        "## Locations",
        "",
        "### Coffee Shop",
        "- **Description**: A cozy downtown cafe",
        "- **Tags**: indoor, warm",
        "",
        "### City Park",
        "- **Description**: A sprawling green space",
        "",
        "## Scene",
        "",
        "- **Where/When**: The coffee shop, morning",
        "- **Current Location**: Coffee Shop",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.locations).toHaveLength(2);
      expect(result.scene.locationId).toBeDefined();
      const coffeeShop = result.locations.find((l) => l.name === "Coffee Shop");
      expect(result.scene.locationId).toBe(coffeeShop!.id);
    });

    it("does not set locationId when no locations match", () => {
      const md = [
        "## Locations",
        "",
        "### Coffee Shop",
        "- **Description**: A cozy downtown cafe",
        "",
        "## Scene",
        "",
        "- **Where/When**: The park",
        "- **Current Location**: Nonexistent Place",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.scene.locationId).toBeUndefined();
    });

    it("falls back to scene.location for locationId resolution", () => {
      const md = [
        "## Locations",
        "",
        "### City Park",
        "- **Description**: Green space",
        "",
        "## Scene",
        "",
        "- **Where/When**: City Park",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      const park = result.locations.find((l) => l.name === "City Park");
      expect(result.scene.locationId).toBe(park!.id);
    });
  });

  describe("demeanor parsing", () => {
    it("parses demeanor with energy values", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "",
        "## Current Demeanor",
        "",
        "- **Amanda's mood**: Cheerful but tired",
        "- **Energy between them**: Warm and comfortable",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.demeanor).toHaveLength(1);
      expect(result.demeanor[0]!.mood).toBe("Cheerful but tired");
      expect(result.demeanor[0]!.energy).toBe("Warm and comfortable");
    });

    it("handles demeanor section with only energy", () => {
      const md = [
        "## Demeanor",
        "",
        "- **Energy between them**: Tense and awkward",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.demeanor).toHaveLength(1);
      expect(result.demeanor[0]!.energy).toBe("Tense and awkward");
      expect(result.demeanor[0]!.mood).toBe("");
    });
  });

  describe("multiple custom sections", () => {
    it("preserves multiple unrecognized sections", () => {
      const md = [
        "## Secret Lore",
        "",
        "The artifact is hidden in the mountain.",
        "",
        "## House Rules",
        "",
        "Never break the fourth wall.",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.custom).toHaveLength(2);
      expect(result.custom[0]!.heading).toBe("Secret Lore");
      expect(result.custom[0]!.content).toBe(
        "The artifact is hidden in the mountain.",
      );
      expect(result.custom[1]!.heading).toBe("House Rules");
      expect(result.custom[1]!.content).toBe("Never break the fourth wall.");
    });
  });

  describe("hard facts with various timestamps", () => {
    it("parses facts without timestamps", () => {
      const md = [
        "## Hard Facts",
        "",
        "- The house is blue",
        "- The car is red",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.hardFacts).toHaveLength(2);
      expect(result.hardFacts[0]!.fact).toBe("The house is blue");
      expect(result.hardFacts[1]!.fact).toBe("The car is red");
      // They should still have inferred fields
      expect(result.hardFacts[0]!.tags).toBeDefined();
      expect(result.hardFacts[0]!.summary).toBeDefined();
    });

    it("parses multiple facts with timestamps", () => {
      const md = [
        "## Hard Facts (do not contradict these)",
        "",
        "- Fact one (added: 2026-01-01)",
        "- Fact two (added: 2026-03-15)",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.hardFacts).toHaveLength(2);
      expect(result.hardFacts[0]!.establishedAt).toBe("2026-01-01");
      expect(result.hardFacts[1]!.establishedAt).toBe("2026-03-15");
    });
  });

  describe("open threads with status and hooks", () => {
    it("parses threads with resolution hints", () => {
      const md = [
        "## Threads",
        "",
        "- Find the lost key (resolves when: key is found) (added: 2026-02-01)",
        "- Talk to the mayor (added: 2026-02-05)",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.openThreads).toHaveLength(2);

      const keyThread = result.openThreads.find((t) =>
        t.description.includes("key"),
      )!;
      expect(keyThread.resolutionHint).toBe("key is found");
      expect(keyThread.createdAt).toBe("2026-02-01");
      expect(keyThread.status).toBe("active");
      expect(keyThread.hook).toBeTruthy();

      const mayorThread = result.openThreads.find((t) =>
        t.description.includes("mayor"),
      )!;
      expect(mayorThread.resolutionHint).toBe("");
      expect(mayorThread.createdAt).toBe("2026-02-05");
    });
  });

  describe("relationship arrow variants", () => {
    it("handles unicode arrow in relationships", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "- **Jake** -- Customer",
        "",
        "## Relationships",
        "",
        "- **Amanda → Jake**: Good friends",
      ].join("\n");

      const result = parseMarkdownToStructured(md);
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0]!.description).toBe("Good friends");
    });
  });

  describe("locations parsing through parser", () => {
    it("parses locations with connections", () => {
      const md = [
        "## Locations",
        "",
        "### Tavern",
        "- **Description**: A rustic tavern",
        "- **Tags**: indoor, social",
        "- **Atmosphere**: Lively",
        "- **Connected to**: Market Square (through the front door; 2 min walk)",
        "",
        "### Market Square",
        "- **Description**: An open-air market",
        "- **Tags**: outdoor, busy",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.locations).toHaveLength(2);

      const tavern = result.locations.find((l) => l.name === "Tavern")!;
      expect(tavern.description).toBe("A rustic tavern");
      expect(tavern.tags).toEqual(["indoor", "social"]);
      expect(tavern.atmosphere).toBe("Lively");
      expect(tavern.connectedTo).toHaveLength(1);
      expect(tavern.connectedTo[0]!.locationName).toBe("Market Square");
      expect(tavern.connectedTo[0]!.description).toBe("through the front door");
      expect(tavern.connectedTo[0]!.traversalHint).toBe("2 min walk");

      const market = result.locations.find((l) => l.name === "Market Square")!;
      expect(market.tags).toEqual(["outdoor", "busy"]);
      expect(market.connectedTo).toHaveLength(0);
    });
  });

  describe("section heading aliases", () => {
    it("parses 'Facts' heading as hardFacts", () => {
      const md = ["## Facts", "", "- Water is wet (added: 2026-01-01)"].join(
        "\n",
      );

      const result = parseMarkdownToStructured(md);
      expect(result.hardFacts).toHaveLength(1);
    });

    it("parses 'Threads' heading as openThreads", () => {
      const md = ["## Threads", "", "- Do the thing (added: 2026-01-01)"].join(
        "\n",
      );

      const result = parseMarkdownToStructured(md);
      expect(result.openThreads).toHaveLength(1);
    });

    it("parses 'Characters' heading as appearance", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "",
        "## Characters",
        "",
        "### Amanda",
        "",
        "#### Appearance",
        "",
        "- **Eyes**: Blue",
      ].join("\n");

      const result = parseMarkdownToStructured(md);
      expect(result.appearance).toHaveLength(1);
      expect(result.appearance[0]!.attribute).toBe("Eyes");
    });
  });

  describe("heading with parenthetical suffix", () => {
    it("strips parenthetical from heading for section resolution", () => {
      const md = [
        "## Hard Facts (do not contradict these)",
        "",
        "- The world is round (added: 2026-03-01)",
      ].join("\n");

      const result = parseMarkdownToStructured(md);
      expect(result.hardFacts).toHaveLength(1);
      expect(result.hardFacts[0]!.fact).toBe("The world is round");
    });
  });

  describe("entity registration from non-cast sections", () => {
    it("creates entities mentioned only in relationships", () => {
      const md = [
        "## Relationships",
        "",
        "- **Alice > Bob**: Best friends",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(2);
      expect(result.entities.find((e) => e.name === "Alice")).toBeDefined();
      expect(result.entities.find((e) => e.name === "Bob")).toBeDefined();
      expect(result.relationships).toHaveLength(1);
    });

    it("creates entities mentioned only in appearance", () => {
      const md = [
        "## Appearance",
        "",
        "- **Charlie - Eyes**: Green and bright",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.name).toBe("Charlie");
    });

    it("creates entities mentioned only in scene presence", () => {
      const md = ["## Scene", "", "- **Who is present**: Diana, Eve"].join(
        "\n",
      );

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(2);
      expect(result.entities.find((e) => e.name === "Diana")).toBeDefined();
      expect(result.entities.find((e) => e.name === "Eve")).toBeDefined();
    });
  });

  describe("demeanor character extraction", () => {
    it("extracts character name from possessive mood key", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- Barista",
        "- **Jake** -- Customer",
        "",
        "## Demeanor",
        "",
        "- **Amanda's mood**: Happy",
        "- **Jake's mood**: Annoyed",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.demeanor).toHaveLength(2);
      const amanda = result.entities.find((e) => e.name === "Amanda")!;
      const jake = result.entities.find((e) => e.name === "Jake")!;

      const amandaDem = result.demeanor.find((d) => d.entityId === amanda.id)!;
      expect(amandaDem.mood).toBe("Happy");

      const jakeDem = result.demeanor.find((d) => d.entityId === jake.id)!;
      expect(jakeDem.mood).toBe("Annoyed");
    });
  });

  describe("cast entry with multiline description", () => {
    it("joins continuation lines into description", () => {
      const md = [
        "## Cast",
        "",
        "- **Amanda** -- A friendly barista who",
        "  loves making lattes and chatting with regulars.",
      ].join("\n");

      const result = parseMarkdownToStructured(md);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]!.description).toContain("friendly barista");
      expect(result.entities[0]!.description).toContain("lattes");
    });
  });
});
