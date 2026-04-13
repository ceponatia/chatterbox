import { describe, it, expect } from "vitest";
import {
  parseSystemPromptToSegments,
  segmentsToMarkdown,
  deserializeSegment,
  createAssemblerFromSerialized,
} from "../parser";
import type { SerializedSegment } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSerializedSegment(
  overrides: Partial<SerializedSegment> = {},
): SerializedSegment {
  return {
    id: "test_seg",
    label: "Test Segment",
    content: "Test content",
    policy: { type: "always" },
    priority: "normal",
    order: 50,
    tokenEstimate: 10,
    category: "test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseSystemPromptToSegments
// ---------------------------------------------------------------------------

describe("parseSystemPromptToSegments", () => {
  it("returns empty array for empty string", () => {
    expect(parseSystemPromptToSegments("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseSystemPromptToSegments("   \n  \n  ")).toEqual([]);
  });

  it("parses single heading with content", () => {
    const md = "### Output format\n\nWrite in third person.";
    const segments = parseSystemPromptToSegments(md);
    expect(segments.length).toBeGreaterThanOrEqual(1);
    const outputSeg = segments.find((s) => s.id === "output_format");
    expect(outputSeg).toBeDefined();
    expect(outputSeg!.content).toContain("Write in third person");
  });

  it("maps 'Output format' heading to output_format segment", () => {
    const md = "### Output format\n\nFormatting rules here.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "output_format");
    expect(seg).toBeDefined();
    expect(seg!.label).toBe("Output Format");
    expect(seg!.policy.type).toBe("always");
    expect(seg!.priority).toBe("critical");
    expect(seg!.category).toBe("rules");
  });

  it("maps 'System prompt rules' heading to core_rules segment", () => {
    const md = "### System prompt rules\n\nRule content here.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "core_rules");
    expect(seg).toBeDefined();
    expect(seg!.priority).toBe("critical");
  });

  it("maps 'Narration Guidelines' heading to narration_guidelines", () => {
    const md = "### Narration Guidelines\n\nGuideline content.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "narration_guidelines");
    expect(seg).toBeDefined();
    expect(seg!.policy).toEqual({ type: "every_n", n: 3 });
    expect(seg!.priority).toBe("normal");
    expect(seg!.category).toBe("rules");
  });

  it("maps 'NPC framing' heading to npc_framing segment", () => {
    const md = "### NPC framing\n\nNPC rules here.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "npc_framing");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("always");
    expect(seg!.priority).toBe("high");
    expect(seg!.category).toBe("character");
  });

  it("maps 'Background and relationship' heading to backstory", () => {
    const md = "### Background and relationship\n\nBackstory content.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "backstory");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("on_topic");
    expect(seg!.priority).toBe("normal");
    expect(seg!.category).toBe("world");
  });

  it("maps 'Background and scenario' heading to backstory", () => {
    const md = "### Background and scenario\n\nScenario content.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "backstory");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("on_topic");
  });

  it("captures unknown heading as custom_N segment", () => {
    const md =
      "### Output format\n\nFormatting.\n\n### Unknown Section\n\nCustom content here.";
    const segments = parseSystemPromptToSegments(md);
    const customSeg = segments.find((s) => s.id === "custom_1");
    expect(customSeg).toBeDefined();
    expect(customSeg!.label).toBe("Unknown Section");
    expect(customSeg!.policy).toEqual({ type: "always" });
    expect(customSeg!.priority).toBe("normal");
    expect(customSeg!.category).toBe("custom");
    expect(customSeg!.content).toContain("Custom content here");
  });

  it("parses leading content before first heading as core_rules", () => {
    const md = "You are the narrator.\n\n### Output format\n\nFormatting.";
    const segments = parseSystemPromptToSegments(md);
    const coreRules = segments.find((s) => s.id === "core_rules");
    expect(coreRules).toBeDefined();
    expect(coreRules!.content).toContain("You are the narrator");
    expect(coreRules!.policy.type).toBe("always");
    expect(coreRules!.priority).toBe("critical");
  });

  it("segments are sorted by order", () => {
    const md =
      "### Background and relationship\n\nBackstory.\n\n### Output format\n\nFormatting.";
    const segments = parseSystemPromptToSegments(md);
    for (let i = 0; i < segments.length - 1; i++) {
      expect(segments[i]!.order).toBeLessThanOrEqual(segments[i + 1]!.order);
    }
  });

  it("assigns tokenEstimate to each segment", () => {
    const md = "### Output format\n\nSome content here for token estimation.";
    const segments = parseSystemPromptToSegments(md);
    for (const seg of segments) {
      expect(seg.tokenEstimate).toBeGreaterThan(0);
    }
  });

  it("Output format heading includes the heading in content", () => {
    const md = "### Output format\n\nFormatting rules.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "output_format");
    expect(seg!.content).toContain("### Output format");
  });

  it("multiple unknown sections get sequential custom_N IDs", () => {
    const md = [
      "### Output format",
      "Formatting.",
      "",
      "### Mystery Section",
      "Mystery content.",
      "",
      "### Another Unknown",
      "More custom content.",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);
    const custom1 = segments.find((s) => s.id === "custom_1");
    const custom2 = segments.find((s) => s.id === "custom_2");
    expect(custom1).toBeDefined();
    expect(custom1!.label).toBe("Mystery Section");
    expect(custom2).toBeDefined();
    expect(custom2!.label).toBe("Another Unknown");
  });

  it("parses character identity sub-sections into separate segments", () => {
    const md = [
      "### Character you embody",
      "Name: TestChar",
      "- Speech patterns and voice: speaks in riddles",
      "  - uses old english",
      "- Look/presence: tall and imposing",
      "  - dark cloak",
      "- Mannerisms: strokes beard thoughtfully",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);

    const identity = segments.find((s) => s.id === "character_identity");
    expect(identity).toBeDefined();
    expect(identity!.content).toContain("Name: TestChar");

    const speech = segments.find((s) => s.id === "speech_patterns");
    expect(speech).toBeDefined();
    expect(speech!.content).toContain("speaks in riddles");

    const appearance = segments.find((s) => s.id === "appearance_visual");
    expect(appearance).toBeDefined();
    expect(appearance!.content).toContain("tall and imposing");

    const mannerisms = segments.find((s) => s.id === "mannerisms");
    expect(mannerisms).toBeDefined();
    expect(mannerisms!.content).toContain("strokes beard");
  });

  it("merges vocabulary_humor sub-segments into vocabulary_humor", () => {
    const md = [
      "### Character you embody",
      "Name: TestChar",
      "- Vocabulary & word choice: uses slang",
      "- Signature moves: finger guns",
      "- Interaction style: playful banter",
      "- Technique: deflects with humor",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);

    // Individual sub-segments should be merged
    expect(segments.find((s) => s.id === "vocabulary_humor_a")).toBeUndefined();
    expect(segments.find((s) => s.id === "vocabulary_humor_b")).toBeUndefined();
    expect(segments.find((s) => s.id === "vocabulary_humor_c")).toBeUndefined();
    expect(segments.find((s) => s.id === "vocabulary_humor_d")).toBeUndefined();

    const merged = segments.find((s) => s.id === "vocabulary_humor");
    expect(merged).toBeDefined();
    expect(merged!.content).toContain("uses slang");
    expect(merged!.content).toContain("finger guns");
    expect(merged!.content).toContain("playful banter");
    expect(merged!.content).toContain("deflects with humor");
    expect(merged!.label).toBe("Vocabulary & Humor");
    expect(merged!.policy).toEqual({ type: "every_n", n: 2 });
    expect(merged!.priority).toBe("high");
  });

  it("merges outfit_hairstyle sub-segments into outfit_hairstyle", () => {
    const md = [
      "### Character you embody",
      "Name: TestChar",
      "- Outfit: casual jeans and tee",
      "- Hairstyle: short and messy",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);

    expect(segments.find((s) => s.id === "outfit_hairstyle_a")).toBeUndefined();
    expect(segments.find((s) => s.id === "outfit_hairstyle_b")).toBeUndefined();

    const merged = segments.find((s) => s.id === "outfit_hairstyle");
    expect(merged).toBeDefined();
    expect(merged!.content).toContain("casual jeans");
    expect(merged!.content).toContain("short and messy");
    expect(merged!.label).toBe("Outfit & Hairstyle");
    expect(merged!.policy).toEqual({ type: "every_n", n: 2 });
    expect(merged!.priority).toBe("normal");
  });

  it("parses voice_sound sub-section", () => {
    const md = [
      "### Character you embody",
      "Name: TestChar",
      "- Voice description: deep and gravelly",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);
    const voice = segments.find((s) => s.id === "voice_sound");
    expect(voice).toBeDefined();
    expect(voice!.content).toContain("deep and gravelly");
  });

  it("parses relationship_status sub-section", () => {
    const md = [
      "### Character you embody",
      "Name: TestChar",
      "- Initial relationship status: childhood friends",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);
    const rel = segments.find((s) => s.id === "relationship_status");
    expect(rel).toBeDefined();
    expect(rel!.content).toContain("childhood friends");
    expect(rel!.policy).toEqual({
      type: "on_state_field",
      field: "relationships",
    });
  });

  it("parses realistic multi-section document with all known heading types", () => {
    const md = [
      "You are the narrator.",
      "",
      "### Output format",
      "Write in present tense.",
      "",
      "### Narration Guidelines",
      "Advance gradually.",
      "",
      "### Setting and scope",
      "Modern day.",
      "",
      "### Character you embody",
      "Name: Alice",
      "- Speech patterns and voice: cheerful",
      "- Look/presence: short and energetic",
      "",
      "### NPC framing",
      "NPCs react naturally.",
      "",
      "### Background and relationship",
      "Met in school.",
      "",
      "### Interaction guidelines",
      "One beat per turn.",
      "",
      "### Custom Extra Section",
      "Extra content.",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);

    // All known segments should be present
    expect(segments.find((s) => s.id === "core_rules")).toBeDefined();
    expect(segments.find((s) => s.id === "output_format")).toBeDefined();
    expect(segments.find((s) => s.id === "narration_guidelines")).toBeDefined();
    expect(segments.find((s) => s.id === "setting_premise")).toBeDefined();
    expect(segments.find((s) => s.id === "character_identity")).toBeDefined();
    expect(segments.find((s) => s.id === "speech_patterns")).toBeDefined();
    expect(segments.find((s) => s.id === "appearance_visual")).toBeDefined();
    expect(segments.find((s) => s.id === "npc_framing")).toBeDefined();
    expect(segments.find((s) => s.id === "backstory")).toBeDefined();
    expect(segments.find((s) => s.id === "interaction_guide")).toBeDefined();
    expect(segments.find((s) => s.id === "custom_1")).toBeDefined();

    // Verify order is maintained
    for (let i = 0; i < segments.length - 1; i++) {
      expect(segments[i]!.order).toBeLessThanOrEqual(segments[i + 1]!.order);
    }
  });

  it("Setting and scope includes heading in content", () => {
    const md = "### Setting and scope\n\nModern day.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "setting_premise");
    expect(seg!.content).toContain("### Setting and scope");
  });

  it("core_rules heading excludes the heading in content", () => {
    const md = "### System prompt rules\n\nDo not break character.";
    const segments = parseSystemPromptToSegments(md);
    const seg = segments.find((s) => s.id === "core_rules");
    expect(seg).toBeDefined();
    expect(seg!.content).not.toContain("### System prompt rules");
    expect(seg!.content).toContain("Do not break character");
  });

  it("custom segments have incrementing order starting at 81", () => {
    const md = [
      "### Unknown A",
      "Content A.",
      "",
      "### Unknown B",
      "Content B.",
    ].join("\n");
    const segments = parseSystemPromptToSegments(md);
    const custom1 = segments.find((s) => s.id === "custom_1");
    const custom2 = segments.find((s) => s.id === "custom_2");
    expect(custom1!.order).toBe(81);
    expect(custom2!.order).toBe(82);
  });
});

// ---------------------------------------------------------------------------
// segmentsToMarkdown
// ---------------------------------------------------------------------------

describe("segmentsToMarkdown", () => {
  it("returns empty string for empty array", () => {
    expect(segmentsToMarkdown([])).toBe("");
  });

  it("returns content for single segment", () => {
    const segments = [makeSerializedSegment({ content: "Hello world" })];
    expect(segmentsToMarkdown(segments)).toBe("Hello world");
  });

  it("joins multiple segments with double newline", () => {
    const segments = [
      makeSerializedSegment({ content: "First", order: 1 }),
      makeSerializedSegment({ content: "Second", order: 2, id: "seg2" }),
    ];
    expect(segmentsToMarkdown(segments)).toBe("First\n\nSecond");
  });

  it("sorts segments by order", () => {
    const segments = [
      makeSerializedSegment({ content: "Second", order: 20, id: "b" }),
      makeSerializedSegment({ content: "First", order: 10, id: "a" }),
    ];
    expect(segmentsToMarkdown(segments)).toBe("First\n\nSecond");
  });

  it("does not mutate the input array", () => {
    const segments: SerializedSegment[] = [
      makeSerializedSegment({ content: "B", order: 2, id: "b" }),
      makeSerializedSegment({ content: "A", order: 1, id: "a" }),
    ];
    const copy = [...segments];
    segmentsToMarkdown(segments);
    expect(segments[0]!.id).toBe(copy[0]!.id);
    expect(segments[1]!.id).toBe(copy[1]!.id);
  });
});

// ---------------------------------------------------------------------------
// deserializeSegment
// ---------------------------------------------------------------------------

describe("deserializeSegment", () => {
  it("deserializes always policy", () => {
    const seg = deserializeSegment(
      makeSerializedSegment({ policy: { type: "always" } }),
    );
    expect(seg.policy).toEqual({ type: "always" });
  });

  it("deserializes every_n policy", () => {
    const seg = deserializeSegment(
      makeSerializedSegment({ policy: { type: "every_n", n: 3 } }),
    );
    expect(seg.policy).toEqual({ type: "every_n", n: 3 });
  });

  it("deserializes on_topic policy", () => {
    const seg = deserializeSegment(
      makeSerializedSegment({
        policy: { type: "on_topic", keywords: ["school", "remember"] },
      }),
    );
    expect(seg.policy).toEqual({
      type: "on_topic",
      keywords: ["school", "remember"],
    });
  });

  it("deserializes on_state_field policy", () => {
    const seg = deserializeSegment(
      makeSerializedSegment({
        policy: { type: "on_state_field", field: "relationships" },
      }),
    );
    expect(seg.policy).toEqual({
      type: "on_state_field",
      field: "relationships",
    });
  });

  it("deserializes on_presence policy", () => {
    const seg = deserializeSegment(
      makeSerializedSegment({
        policy: { type: "on_presence", entityId: "entity-1" },
      }),
    );
    expect(seg.policy).toEqual({ type: "on_presence", entityId: "entity-1" });
  });

  it("preserves all segment fields", () => {
    const input = makeSerializedSegment({
      id: "my_id",
      label: "My Label",
      content: "My content",
      priority: "high",
      order: 42,
      tokenEstimate: 99,
      category: "character",
      omittedSummary: "brief summary",
    });
    const seg = deserializeSegment(input);
    expect(seg.id).toBe("my_id");
    expect(seg.label).toBe("My Label");
    expect(seg.content).toBe("My content");
    expect(seg.priority).toBe("high");
    expect(seg.order).toBe(42);
    expect(seg.tokenEstimate).toBe(99);
    expect(seg.category).toBe("character");
    expect(seg.omittedSummary).toBe("brief summary");
  });

  it("preserves undefined omittedSummary", () => {
    const input = makeSerializedSegment({ omittedSummary: undefined });
    const seg = deserializeSegment(input);
    expect(seg.omittedSummary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createAssemblerFromSerialized
// ---------------------------------------------------------------------------

describe("createAssemblerFromSerialized", () => {
  it("creates assembler with all segments registered", () => {
    const segments = [
      makeSerializedSegment({ id: "a", order: 1 }),
      makeSerializedSegment({ id: "b", order: 2 }),
    ];
    const assembler = createAssemblerFromSerialized(segments);
    const listed = assembler.listSegments();
    expect(listed).toHaveLength(2);
    expect(listed.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("assembled output uses deserialized policies", () => {
    const segments = [
      makeSerializedSegment({
        id: "always_seg",
        content: "Always here",
        policy: { type: "always" },
        priority: "normal",
        order: 1,
      }),
      makeSerializedSegment({
        id: "topic_seg",
        content: "Topic content",
        policy: { type: "on_topic", keywords: ["school"] },
        priority: "normal",
        order: 2,
      }),
    ];
    const assembler = createAssemblerFromSerialized(segments);
    const result = assembler.assemble({
      turnNumber: 1,
      lastIncludedAt: {},
      currentUserMessage: "hello",
      stateFields: {},
      tokenBudget: 10000,
    });
    expect(result.included).toContain("always_seg");
    expect(result.included).not.toContain("topic_seg");
  });

  it("handles empty segment array", () => {
    const assembler = createAssemblerFromSerialized([]);
    expect(assembler.listSegments()).toHaveLength(0);
  });
});
