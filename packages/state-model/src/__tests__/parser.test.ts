import { describe, it, expect } from "vitest";
import { parseMarkdownToStructured } from "../parser.js";
import { emptyStructuredState } from "../types.js";

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
});
