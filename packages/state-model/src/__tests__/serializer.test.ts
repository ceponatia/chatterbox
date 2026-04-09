import { describe, it, expect } from "vitest";
import { structuredToMarkdown } from "../serializer.js";
import { parseMarkdownToStructured } from "../parser.js";
import { emptyStructuredState } from "../types.js";
import type { StructuredStoryState } from "../types.js";

function buildTestState(): StructuredStoryState {
  const state = emptyStructuredState();

  state.entities = [
    {
      id: "ent-amanda",
      name: "Amanda Campbell",
      description: "Runs the coffee shop",
      isPlayerCharacter: false,
    },
    {
      id: "ent-jake",
      name: "Jake Torres",
      description: "Regular customer",
      isPlayerCharacter: true,
    },
  ];

  state.relationships = [
    {
      fromEntityId: "ent-amanda",
      toEntityId: "ent-jake",
      description: "Friendly regular customer",
      details: ["Enjoys chatting during slow hours", "Knows his usual order"],
      tone: "warm",
    },
  ];

  state.appearance = [
    {
      entityId: "ent-amanda",
      attribute: "Eyes",
      description: "Warm brown with laugh lines",
      category: "face",
    },
    {
      entityId: "ent-amanda",
      attribute: "Hair",
      description: "Dark brown, shoulder length",
      category: "hair",
    },
  ];

  state.scene = {
    location: "The coffee shop, late afternoon",
    presentEntityIds: ["ent-amanda", "ent-jake"],
    atmosphere: "Warm and relaxed",
  };

  state.demeanor = [
    {
      entityId: "ent-amanda",
      mood: "Cheerful but a bit tired",
      energy: "Easy and comfortable",
    },
  ];

  state.openThreads = [
    {
      id: "thread-book",
      description: "Jake promised to bring Amanda a book recommendation",
      hook: "Jake promised to bring Amanda",
      resolutionHint: "Jake brings the book",
      status: "active",
      createdAt: "2026-01-10",
    },
  ];

  state.hardFacts = [
    {
      fact: "Amanda has worked at the coffee shop for 3 years",
      summary: "Amanda has worked at the",
      tags: ["biographical"],
      establishedAt: "2026-01-05",
      lastConfirmedAt: "2026-01-05",
      superseded: false,
      createdAt: "2026-01-05",
    },
  ];

  state.style = [
    "Warm, conversational tone",
    "Include sensory details about the coffee shop",
  ];

  state.custom = [
    {
      heading: "Special Rules",
      content: "Always describe the smell of coffee in the opening line.",
    },
  ];

  return state;
}

describe("structuredToMarkdown", () => {
  describe("basic serialization", () => {
    it("serializes all sections into markdown", () => {
      const state = buildTestState();
      const md = structuredToMarkdown(state);

      expect(md).toContain("## Cast");
      expect(md).toContain("**Amanda Campbell**");
      expect(md).toContain("**Jake Torres**");
      expect(md).toContain("[player character]");

      expect(md).toContain("## Relationships");
      expect(md).toContain("Amanda Campbell");
      expect(md).toContain("Jake Torres");
      expect(md).toContain("Friendly regular customer");
      expect(md).toContain("Enjoys chatting during slow hours");

      expect(md).toContain("## Characters");
      expect(md).toContain("### Amanda Campbell");
      expect(md).toContain("**Eyes**: Warm brown with laugh lines");
      expect(md).toContain("**Hair**: Dark brown, shoulder length");

      expect(md).toContain("## Scene");
      expect(md).toContain("The coffee shop, late afternoon");
      expect(md).toContain("Amanda Campbell, Jake Torres");
      expect(md).toContain("Warm and relaxed");

      expect(md).toContain("## Current Demeanor");
      expect(md).toContain("Cheerful but a bit tired");

      expect(md).toContain("## Open Threads");
      expect(md).toContain(
        "Jake promised to bring Amanda a book recommendation",
      );

      expect(md).toContain("## Hard Facts");
      expect(md).toContain("Amanda has worked at the coffee shop for 3 years");

      expect(md).toContain("## Style");
      expect(md).toContain("Warm, conversational tone");

      expect(md).toContain("## Special Rules");
      expect(md).toContain(
        "Always describe the smell of coffee in the opening line.",
      );
    });
  });

  describe("filters superseded facts", () => {
    it("excludes facts with superseded: true", () => {
      const state = buildTestState();
      state.hardFacts.push({
        fact: "Amanda used to work at a bookstore",
        summary: "Amanda used to work at",
        tags: ["biographical"],
        establishedAt: "2026-01-01",
        superseded: true,
        supersededBy: "coffee shop fact",
        createdAt: "2026-01-01",
      });

      const md = structuredToMarkdown(state);

      expect(md).toContain("Amanda has worked at the coffee shop for 3 years");
      expect(md).not.toContain("Amanda used to work at a bookstore");
    });
  });

  describe("filters resolved and stale threads", () => {
    it("excludes resolved threads", () => {
      const state = buildTestState();
      state.openThreads.push({
        id: "thread-resolved",
        description: "Amanda fixed the espresso machine",
        resolutionHint: "",
        status: "resolved",
        createdAt: "2026-01-08",
      });

      const md = structuredToMarkdown(state);

      expect(md).toContain(
        "Jake promised to bring Amanda a book recommendation",
      );
      expect(md).not.toContain("Amanda fixed the espresso machine");
    });

    it("excludes stale threads", () => {
      const state = buildTestState();
      state.openThreads.push({
        id: "thread-stale",
        description: "Some old forgotten thread",
        resolutionHint: "",
        status: "stale",
        createdAt: "2025-12-01",
      });

      const md = structuredToMarkdown(state);

      expect(md).not.toContain("Some old forgotten thread");
    });

    it("includes active threads", () => {
      const state = buildTestState();
      const md = structuredToMarkdown(state);

      expect(md).toContain(
        "Jake promised to bring Amanda a book recommendation",
      );
    });
  });

  describe("thread resolution hints", () => {
    it("includes resolves when hint in output", () => {
      const state = buildTestState();
      const md = structuredToMarkdown(state);

      expect(md).toContain("(resolves when: Jake brings the book)");
    });

    it("omits resolves when for threads without hints", () => {
      const state = buildTestState();
      state.openThreads = [
        {
          id: "thread-no-hint",
          description: "Amanda mentioned Friday plans",
          resolutionHint: "",
          status: "active",
          createdAt: "2026-01-12",
        },
      ];

      const md = structuredToMarkdown(state);

      expect(md).toContain("Amanda mentioned Friday plans");
      expect(md).not.toContain("resolves when");
    });
  });

  describe("timestamps", () => {
    it("includes added date on facts", () => {
      const state = buildTestState();
      const md = structuredToMarkdown(state);

      expect(md).toContain("(added: 2026-01-05)");
    });

    it("includes added date on threads", () => {
      const state = buildTestState();
      const md = structuredToMarkdown(state);

      expect(md).toContain("(added: 2026-01-10)");
    });
  });

  describe("empty state", () => {
    it("produces Scene section with placeholders", () => {
      const state = emptyStructuredState();
      const md = structuredToMarkdown(state);

      expect(md).toContain("## Scene");
      expect(md).toContain("[to be filled during play]");
    });
  });

  describe("roundtrip", () => {
    it("preserves key fields through parse -> serialize -> parse", () => {
      const originalMd = [
        "## Cast",
        "",
        "- **Amanda Campbell** -- Runs the coffee shop",
        "- **Jake Torres** -- Regular customer. [player character]",
        "",
        "## Relationships",
        "",
        "- **Amanda Campbell > Jake Torres**: Friendly regular",
        "  - Chats during slow hours",
        "",
        "## Characters",
        "",
        "### Amanda Campbell",
        "",
        "#### Appearance",
        "",
        "- **Eyes**: Warm brown",
        "- **Hair**: Dark brown, shoulder length",
        "",
        "## Scene",
        "",
        "- **Where/When**: The coffee shop, late afternoon",
        "- **Who is present**: Amanda Campbell, Jake Torres",
        "- **Atmosphere**: Warm and relaxed",
        "",
        "## Open Threads",
        "",
        "- Jake will bring a book (resolves when: Jake brings it) (added: 2026-01-10)",
        "",
        "## Hard Facts (do not contradict these)",
        "",
        "- Amanda has worked here for 3 years (added: 2026-01-05)",
        "",
        "## Style",
        "",
        "- Conversational tone",
      ].join("\n");

      const first = parseMarkdownToStructured(originalMd);
      const serialized = structuredToMarkdown(first);
      const second = parseMarkdownToStructured(serialized);

      // Entity count and names preserved
      expect(second.entities).toHaveLength(first.entities.length);
      const firstNames = first.entities.map((e) => e.name).sort();
      const secondNames = second.entities.map((e) => e.name).sort();
      expect(secondNames).toEqual(firstNames);

      // Relationship count preserved
      expect(second.relationships).toHaveLength(first.relationships.length);

      // Scene location preserved
      expect(second.scene.location).toBe(first.scene.location);

      // Appearance count preserved
      expect(second.appearance).toHaveLength(first.appearance.length);

      // Thread and fact counts preserved
      expect(second.openThreads).toHaveLength(first.openThreads.length);
      expect(second.hardFacts).toHaveLength(first.hardFacts.length);

      // Style preserved
      expect(second.style).toHaveLength(first.style.length);
    });
  });
});
