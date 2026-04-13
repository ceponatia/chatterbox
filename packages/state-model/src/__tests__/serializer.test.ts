import { describe, it, expect } from "vitest";
import { structuredToMarkdown } from "../serializer";
import { parseMarkdownToStructured } from "../parser";
import { emptyStructuredState } from "../types";
import type { StructuredStoryState } from "../types";

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

  describe("appearance grouping", () => {
    it("serializes entity with zero appearance entries without Characters section", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "Barista",
          isPlayerCharacter: false,
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).not.toContain("## Characters");
    });

    it("serializes entity with one appearance entry", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "Barista",
          isPlayerCharacter: false,
        },
      ];
      state.appearance = [
        {
          entityId: "ent-a",
          attribute: "Eyes",
          description: "Brown",
          category: "face",
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("### Amanda");
      expect(md).toContain("**Eyes**: Brown");
    });

    it("serializes entity with three appearance entries", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "Barista",
          isPlayerCharacter: false,
        },
      ];
      state.appearance = [
        {
          entityId: "ent-a",
          attribute: "Eyes",
          description: "Brown",
          category: "face",
        },
        {
          entityId: "ent-a",
          attribute: "Hair",
          description: "Black",
          category: "hair",
        },
        {
          entityId: "ent-a",
          attribute: "Build",
          description: "Tall",
          category: "build",
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("**Eyes**: Brown");
      expect(md).toContain("**Hair**: Black");
      expect(md).toContain("**Build**: Tall");
    });
  });

  describe("relationships with details", () => {
    it("serializes relationship with zero details", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "",
          isPlayerCharacter: false,
        },
        {
          id: "ent-b",
          name: "Jake",
          description: "",
          isPlayerCharacter: false,
        },
      ];
      state.relationships = [
        {
          fromEntityId: "ent-a",
          toEntityId: "ent-b",
          description: "Friends",
          details: [],
          tone: "warm",
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("**Amanda \u2192 Jake**: Friends");
      // No detail sub-bullets (indented bullets under the relationship)
      expect(md).not.toContain("  - ");
    });

    it("serializes relationship with three detail lines", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "",
          isPlayerCharacter: false,
        },
        {
          id: "ent-b",
          name: "Jake",
          description: "",
          isPlayerCharacter: false,
        },
      ];
      state.relationships = [
        {
          fromEntityId: "ent-a",
          toEntityId: "ent-b",
          description: "Friends",
          details: ["Detail one", "Detail two", "Detail three"],
          tone: "warm",
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("  - Detail one");
      expect(md).toContain("  - Detail two");
      expect(md).toContain("  - Detail three");
    });
  });

  describe("locations serialization", () => {
    it("serializes locations with all optional fields present", () => {
      const state = emptyStructuredState();
      state.locations = [
        {
          id: "loc-1",
          name: "Tavern",
          description: "A rustic tavern",
          tags: ["indoor", "social"],
          atmosphere: "Lively",
          connectedTo: [
            {
              locationId: "loc-2",
              locationName: "Market",
              description: "through the door",
              traversalHint: "2 min walk",
            },
          ],
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("### Tavern");
      expect(md).toContain("**Description**: A rustic tavern");
      expect(md).toContain("**Tags**: indoor, social");
      expect(md).toContain("**Atmosphere**: Lively");
      expect(md).toContain(
        "**Connected to**: Market (through the door; 2 min walk)",
      );
    });

    it("serializes location with no optional fields", () => {
      const state = emptyStructuredState();
      state.locations = [
        {
          id: "loc-1",
          name: "Void",
          description: "",
          tags: [],
          atmosphere: "",
          connectedTo: [],
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("### Void");
      expect(md).not.toContain("**Description**");
      expect(md).not.toContain("**Tags**");
      expect(md).not.toContain("**Atmosphere**");
      expect(md).not.toContain("**Connected to**");
    });

    it("serializes connection with only description, no traversal hint", () => {
      const state = emptyStructuredState();
      state.locations = [
        {
          id: "loc-1",
          name: "Room",
          description: "A room",
          tags: [],
          atmosphere: "",
          connectedTo: [
            {
              locationId: "loc-2",
              locationName: "Hall",
              description: "through the archway",
            },
          ],
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("Hall (through the archway)");
    });

    it("serializes connection with no description or hint", () => {
      const state = emptyStructuredState();
      state.locations = [
        {
          id: "loc-1",
          name: "Room",
          description: "A room",
          tags: [],
          atmosphere: "",
          connectedTo: [
            {
              locationId: "loc-2",
              locationName: "Hall",
            },
          ],
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("**Connected to**: Hall");
      expect(md).not.toContain("Hall (");
    });
  });

  describe("demeanor serialization", () => {
    it("serializes demeanor with mood and energy", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "",
          isPlayerCharacter: false,
        },
      ];
      state.demeanor = [{ entityId: "ent-a", mood: "Happy", energy: "High" }];
      const md = structuredToMarkdown(state);
      expect(md).toContain("## Current Demeanor");
      expect(md).toContain("Amanda's mood");
      expect(md).toContain("Happy");
      expect(md).toContain("**Energy between them**: High");
    });

    it("serializes demeanor with mood but no energy", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "",
          isPlayerCharacter: false,
        },
      ];
      state.demeanor = [{ entityId: "ent-a", mood: "Happy", energy: "" }];
      const md = structuredToMarkdown(state);
      expect(md).toContain("Happy");
      expect(md).not.toContain("Energy between them");
    });

    it("omits demeanor section when empty", () => {
      const state = emptyStructuredState();
      const md = structuredToMarkdown(state);
      expect(md).not.toContain("## Current Demeanor");
    });
  });

  describe("scene serialization details", () => {
    it("serializes scene with empty location as placeholder", () => {
      const state = emptyStructuredState();
      const md = structuredToMarkdown(state);
      expect(md).toContain("[to be filled during play]");
    });

    it("serializes scene with no entities as placeholder", () => {
      const state = emptyStructuredState();
      state.scene.location = "Some place";
      const md = structuredToMarkdown(state);
      expect(md).toContain("**Who is present**: [to be filled during play]");
    });

    it("serializes scene with atmosphere", () => {
      const state = emptyStructuredState();
      state.entities = [
        {
          id: "ent-a",
          name: "Amanda",
          description: "",
          isPlayerCharacter: false,
        },
      ];
      state.scene = {
        location: "The park",
        presentEntityIds: ["ent-a"],
        atmosphere: "Peaceful",
      };
      const md = structuredToMarkdown(state);
      expect(md).toContain("**Atmosphere**: Peaceful");
    });

    it("omits atmosphere line when empty", () => {
      const state = emptyStructuredState();
      state.scene = {
        location: "The park",
        presentEntityIds: [],
        atmosphere: "",
      };
      const md = structuredToMarkdown(state);
      expect(md).not.toContain("Atmosphere");
    });
  });

  describe("hard facts serialization", () => {
    it("uses establishedAt for date when available", () => {
      const state = emptyStructuredState();
      state.hardFacts = [
        {
          fact: "Test fact",
          summary: "Test",
          tags: ["biographical"],
          establishedAt: "2026-03-01",
          createdAt: "2026-02-01",
          superseded: false,
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("(added: 2026-03-01)");
    });

    it("falls back to createdAt when establishedAt is missing", () => {
      const state = emptyStructuredState();
      state.hardFacts = [
        {
          fact: "Test fact",
          summary: "Test",
          tags: ["biographical"],
          createdAt: "2026-02-01",
          superseded: false,
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("(added: 2026-02-01)");
    });

    it("omits Hard Facts section when all facts are superseded", () => {
      const state = emptyStructuredState();
      state.hardFacts = [
        {
          fact: "Old fact",
          superseded: true,
          supersededBy: "Newer fact",
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).not.toContain("## Hard Facts");
    });
  });

  describe("open threads serialization", () => {
    it("includes evolved threads in output", () => {
      const state = emptyStructuredState();
      state.openThreads = [
        {
          id: "t-1",
          description: "An evolved thread",
          resolutionHint: "",
          status: "evolved",
          createdAt: "2026-01-01",
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("An evolved thread");
    });

    it("omits threads section when all threads are resolved", () => {
      const state = emptyStructuredState();
      state.openThreads = [
        {
          id: "t-1",
          description: "Done thread",
          resolutionHint: "",
          status: "resolved",
          createdAt: "2026-01-01",
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).not.toContain("## Open Threads");
    });
  });

  describe("style serialization", () => {
    it("serializes style items as bullet list", () => {
      const state = emptyStructuredState();
      state.style = ["Dark tone", "Short sentences"];
      const md = structuredToMarkdown(state);
      expect(md).toContain("## Style");
      expect(md).toContain("- Dark tone");
      expect(md).toContain("- Short sentences");
    });

    it("omits style section when empty", () => {
      const state = emptyStructuredState();
      const md = structuredToMarkdown(state);
      expect(md).not.toContain("## Style");
    });
  });

  describe("custom sections serialization", () => {
    it("serializes multiple custom sections", () => {
      const state = emptyStructuredState();
      state.custom = [
        { heading: "Lore", content: "Ancient world." },
        { heading: "Rules", content: "No meta." },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("## Lore");
      expect(md).toContain("Ancient world.");
      expect(md).toContain("## Rules");
      expect(md).toContain("No meta.");
    });

    it("omits custom sections when empty", () => {
      const state = emptyStructuredState();
      state.custom = [];
      const md = structuredToMarkdown(state);
      // Should just have Scene section
      const headings = md.match(/^## /gm) ?? [];
      expect(headings.length).toBe(1); // Scene only
    });
  });

  describe("timestamp sorting", () => {
    it("sorts facts by createdAt date", () => {
      const state = emptyStructuredState();
      state.hardFacts = [
        {
          fact: "Later fact",
          establishedAt: "2026-03-01",
          createdAt: "2026-03-01",
          superseded: false,
        },
        {
          fact: "Earlier fact",
          establishedAt: "2026-01-01",
          createdAt: "2026-01-01",
          superseded: false,
        },
      ];
      const md = structuredToMarkdown(state);
      const laterIdx = md.indexOf("Later fact");
      const earlierIdx = md.indexOf("Earlier fact");
      // Earlier fact should come first in output
      expect(earlierIdx).toBeLessThan(laterIdx);
    });
  });

  describe("entity ID fallback", () => {
    it("uses raw ID as name when entity not found", () => {
      const state = emptyStructuredState();
      state.relationships = [
        {
          fromEntityId: "unknown-1",
          toEntityId: "unknown-2",
          description: "Mysterious bond",
          details: [],
        },
      ];
      const md = structuredToMarkdown(state);
      expect(md).toContain("unknown-1");
      expect(md).toContain("unknown-2");
    });
  });
});
