import { describe, it, expect } from "vitest";
import {
  HEADING_MAPPINGS,
  SUB_SECTION_MAPPINGS,
  MERGE_GROUPS,
} from "../parser-mappings";

// ---------------------------------------------------------------------------
// HEADING_MAPPINGS
// ---------------------------------------------------------------------------

describe("HEADING_MAPPINGS", () => {
  it("has expected number of entries", () => {
    expect(HEADING_MAPPINGS).toHaveLength(8);
  });

  // -----------------------------------------------------------------------
  // system prompt -> core_rules
  // -----------------------------------------------------------------------
  describe("system prompt -> core_rules", () => {
    const mapping = HEADING_MAPPINGS.find((m) => m.id === "core_rules")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'System prompt' (case insensitive)", () => {
      expect(mapping.pattern.test("System prompt")).toBe(true);
      expect(mapping.pattern.test("system prompt")).toBe(true);
      expect(mapping.pattern.test("SYSTEM PROMPT")).toBe(true);
      expect(mapping.pattern.test("System  prompt")).toBe(true);
    });

    it("matches 'System prompt rules'", () => {
      expect(mapping.pattern.test("System prompt rules")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("Output format")).toBe(false);
      expect(mapping.pattern.test("Character you embody")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("core_rules");
      expect(mapping.label).toBe("Core Narration Rules");
      expect(mapping.policy).toEqual({ type: "always" });
      expect(mapping.priority).toBe("critical");
      expect(mapping.order).toBe(0);
      expect(mapping.category).toBe("rules");
      expect(mapping.includeHeading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // output format -> output_format
  // -----------------------------------------------------------------------
  describe("output format -> output_format", () => {
    const mapping = HEADING_MAPPINGS.find((m) => m.id === "output_format")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'Output format' (case insensitive)", () => {
      expect(mapping.pattern.test("Output format")).toBe(true);
      expect(mapping.pattern.test("output format")).toBe(true);
      expect(mapping.pattern.test("OUTPUT FORMAT")).toBe(true);
      expect(mapping.pattern.test("Output  format")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("System prompt")).toBe(false);
      expect(mapping.pattern.test("Narration Guidelines")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("output_format");
      expect(mapping.label).toBe("Output Format");
      expect(mapping.policy).toEqual({ type: "always" });
      expect(mapping.priority).toBe("critical");
      expect(mapping.order).toBe(10);
      expect(mapping.category).toBe("rules");
      expect(mapping.includeHeading).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // narration guidelines -> narration_guidelines
  // -----------------------------------------------------------------------
  describe("narration guidelines -> narration_guidelines", () => {
    const mapping = HEADING_MAPPINGS.find(
      (m) => m.id === "narration_guidelines",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'Narration Guidelines' (case insensitive)", () => {
      expect(mapping.pattern.test("Narration Guidelines")).toBe(true);
      expect(mapping.pattern.test("narration guidelines")).toBe(true);
      expect(mapping.pattern.test("NARRATION GUIDELINES")).toBe(true);
      expect(mapping.pattern.test("Narration  guidelines")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("Output format")).toBe(false);
      expect(mapping.pattern.test("Interaction guidelines")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("narration_guidelines");
      expect(mapping.label).toBe("Narration Guidelines");
      expect(mapping.policy).toEqual({ type: "every_n", n: 3 });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(5);
      expect(mapping.category).toBe("rules");
      expect(mapping.includeHeading).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // setting and scope -> setting_premise
  // -----------------------------------------------------------------------
  describe("setting and scope -> setting_premise", () => {
    const mapping = HEADING_MAPPINGS.find((m) => m.id === "setting_premise")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'Setting and scope'", () => {
      expect(mapping.pattern.test("Setting and scope")).toBe(true);
      expect(mapping.pattern.test("Setting scope")).toBe(true);
      expect(mapping.pattern.test("SETTING AND SCOPE")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("Setting the scene")).toBe(false);
      expect(mapping.pattern.test("Output format")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("setting_premise");
      expect(mapping.label).toBe("Setting & Premise");
      expect(mapping.policy).toEqual({ type: "always" });
      expect(mapping.priority).toBe("critical");
      expect(mapping.order).toBe(20);
      expect(mapping.category).toBe("world");
      expect(mapping.includeHeading).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // character you embody -> character_identity
  // -----------------------------------------------------------------------
  describe("character you embody -> character_identity", () => {
    const mapping = HEADING_MAPPINGS.find(
      (m) => m.id === "character_identity",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'Character you embody' (case insensitive)", () => {
      expect(mapping.pattern.test("Character you embody")).toBe(true);
      expect(mapping.pattern.test("character you embody")).toBe(true);
      expect(mapping.pattern.test("CHARACTER YOU EMBODY")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("Character identity")).toBe(false);
      expect(mapping.pattern.test("Output format")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("character_identity");
      expect(mapping.label).toBe("Character Identity");
      expect(mapping.policy).toEqual({ type: "always" });
      expect(mapping.priority).toBe("critical");
      expect(mapping.order).toBe(30);
      expect(mapping.category).toBe("character");
      expect(mapping.includeHeading).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // npc framing -> npc_framing
  // -----------------------------------------------------------------------
  describe("npc framing -> npc_framing", () => {
    const mapping = HEADING_MAPPINGS.find((m) => m.id === "npc_framing")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'NPC framing' (case insensitive)", () => {
      expect(mapping.pattern.test("NPC framing")).toBe(true);
      expect(mapping.pattern.test("npc framing")).toBe(true);
      expect(mapping.pattern.test("NPC  framing")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("Character you embody")).toBe(false);
      expect(mapping.pattern.test("Output format")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("npc_framing");
      expect(mapping.label).toBe("NPC Framing");
      expect(mapping.policy).toEqual({ type: "always" });
      expect(mapping.priority).toBe("high");
      expect(mapping.order).toBe(35);
      expect(mapping.category).toBe("character");
      expect(mapping.includeHeading).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // background and relationship/scenario -> backstory
  // -----------------------------------------------------------------------
  describe("background and relationship/scenario -> backstory", () => {
    const mapping = HEADING_MAPPINGS.find((m) => m.id === "backstory")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'Background and relationship'", () => {
      expect(mapping.pattern.test("Background and relationship")).toBe(true);
    });

    it("matches 'Background and scenario'", () => {
      expect(mapping.pattern.test("Background and scenario")).toBe(true);
    });

    it("case insensitive", () => {
      expect(mapping.pattern.test("BACKGROUND AND RELATIONSHIP")).toBe(true);
      expect(mapping.pattern.test("background and scenario")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("Background info")).toBe(false);
      expect(mapping.pattern.test("Output format")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("backstory");
      expect(mapping.label).toBe("Background & Scenario");
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(60);
      expect(mapping.category).toBe("world");
      expect(mapping.includeHeading).toBe(true);
    });

    it("has on_topic policy with correct keywords", () => {
      expect(mapping.policy).toEqual({
        type: "on_topic",
        keywords: [
          "remember",
          "school",
          "middle school",
          "high school",
          "back then",
          "used to",
          "old days",
          "history",
          "childhood",
          "bullied",
          "ugly duckling",
          "reconnect",
        ],
      });
    });
  });

  // -----------------------------------------------------------------------
  // interaction guidelines -> interaction_guide
  // -----------------------------------------------------------------------
  describe("interaction guidelines -> interaction_guide", () => {
    const mapping = HEADING_MAPPINGS.find((m) => m.id === "interaction_guide")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("matches 'Interaction guidelines' (case insensitive)", () => {
      expect(mapping.pattern.test("Interaction guidelines")).toBe(true);
      expect(mapping.pattern.test("interaction guidelines")).toBe(true);
      expect(mapping.pattern.test("INTERACTION GUIDELINES")).toBe(true);
    });

    it("does not match unrelated headings", () => {
      expect(mapping.pattern.test("Narration Guidelines")).toBe(false);
      expect(mapping.pattern.test("Output format")).toBe(false);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("interaction_guide");
      expect(mapping.label).toBe("Interaction Guidelines");
      expect(mapping.policy).toEqual({ type: "every_n", n: 3 });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(65);
      expect(mapping.category).toBe("character");
      expect(mapping.includeHeading).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // No heading matches a non-existent pattern
  // -----------------------------------------------------------------------
  it("no mapping matches a completely unrelated heading", () => {
    const result = HEADING_MAPPINGS.find((m) =>
      m.pattern.test("Cooking recipes"),
    );
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SUB_SECTION_MAPPINGS
// ---------------------------------------------------------------------------

describe("SUB_SECTION_MAPPINGS", () => {
  it("has expected number of entries", () => {
    expect(SUB_SECTION_MAPPINGS).toHaveLength(11);
  });

  // -----------------------------------------------------------------------
  // speech_patterns
  // -----------------------------------------------------------------------
  describe("speech_patterns", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "speech_patterns",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Speech patterns and voice'", () => {
      expect(mapping.startPattern.test("- Speech patterns and voice")).toBe(
        true,
      );
      expect(mapping.startPattern.test("- Speech pattern voice")).toBe(true);
    });

    it("startPattern is case insensitive", () => {
      expect(mapping.startPattern.test("- SPEECH PATTERNS AND VOICE")).toBe(
        true,
      );
    });

    it("startPattern does not match unrelated lines", () => {
      expect(mapping.startPattern.test("- Vocabulary & word choice")).toBe(
        false,
      );
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("speech_patterns");
      expect(mapping.label).toBe("Speech Patterns & Voice");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("high");
      expect(mapping.order).toBe(40);
      expect(mapping.category).toBe("character");
    });

    it("has expected endPatterns count", () => {
      expect(mapping.endPatterns.length).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // vocabulary_humor_a
  // -----------------------------------------------------------------------
  describe("vocabulary_humor_a", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "vocabulary_humor_a",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Vocabulary & word choice'", () => {
      expect(mapping.startPattern.test("- Vocabulary & word choice")).toBe(
        true,
      );
      expect(mapping.startPattern.test("- Vocabulary word choice")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("vocabulary_humor_a");
      expect(mapping.label).toBe("Vocabulary & Word Choice");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("high");
      expect(mapping.order).toBe(45);
      expect(mapping.category).toBe("character");
    });
  });

  // -----------------------------------------------------------------------
  // vocabulary_humor_b
  // -----------------------------------------------------------------------
  describe("vocabulary_humor_b", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "vocabulary_humor_b",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Signature moves'", () => {
      expect(mapping.startPattern.test("- Signature moves")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("vocabulary_humor_b");
      expect(mapping.label).toBe("Signature Moves");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("high");
      expect(mapping.order).toBe(46);
      expect(mapping.category).toBe("character");
    });
  });

  // -----------------------------------------------------------------------
  // vocabulary_humor_c
  // -----------------------------------------------------------------------
  describe("vocabulary_humor_c", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "vocabulary_humor_c",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Interaction style'", () => {
      expect(mapping.startPattern.test("- Interaction style")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("vocabulary_humor_c");
      expect(mapping.label).toBe("Interaction Style & Technique");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("high");
      expect(mapping.order).toBe(47);
      expect(mapping.category).toBe("character");
    });
  });

  // -----------------------------------------------------------------------
  // vocabulary_humor_d
  // -----------------------------------------------------------------------
  describe("vocabulary_humor_d", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "vocabulary_humor_d",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Technique'", () => {
      expect(mapping.startPattern.test("- Technique")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("vocabulary_humor_d");
      expect(mapping.label).toBe("Technique");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("high");
      expect(mapping.order).toBe(48);
      expect(mapping.category).toBe("character");
    });
  });

  // -----------------------------------------------------------------------
  // appearance_visual
  // -----------------------------------------------------------------------
  describe("appearance_visual", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "appearance_visual",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Look/presence'", () => {
      expect(mapping.startPattern.test("- Look/presence")).toBe(true);
      expect(mapping.startPattern.test("- Look / presence")).toBe(true);
      expect(mapping.startPattern.test("- Look presence")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("appearance_visual");
      expect(mapping.label).toBe("Appearance & Visual Presence");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(55);
      expect(mapping.category).toBe("character");
    });

    it("has expected endPatterns count", () => {
      expect(mapping.endPatterns.length).toBe(11);
    });
  });

  // -----------------------------------------------------------------------
  // mannerisms
  // -----------------------------------------------------------------------
  describe("mannerisms", () => {
    const mapping = SUB_SECTION_MAPPINGS.find((m) => m.id === "mannerisms")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Mannerisms'", () => {
      expect(mapping.startPattern.test("- Mannerisms")).toBe(true);
      expect(mapping.startPattern.test("- mannerisms")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("mannerisms");
      expect(mapping.label).toBe("Mannerisms & Physical Beats");
      expect(mapping.policy).toEqual({ type: "every_n", n: 3 });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(50);
      expect(mapping.category).toBe("character");
    });
  });

  // -----------------------------------------------------------------------
  // voice_sound
  // -----------------------------------------------------------------------
  describe("voice_sound", () => {
    const mapping = SUB_SECTION_MAPPINGS.find((m) => m.id === "voice_sound")!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Voice description'", () => {
      expect(mapping.startPattern.test("- Voice description")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("voice_sound");
      expect(mapping.label).toBe("Voice Description (Sound)");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(57);
      expect(mapping.category).toBe("character");
    });

    it("has expected endPatterns count", () => {
      expect(mapping.endPatterns.length).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // outfit_hairstyle_a
  // -----------------------------------------------------------------------
  describe("outfit_hairstyle_a", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "outfit_hairstyle_a",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Outfit'", () => {
      expect(mapping.startPattern.test("- Outfit")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("outfit_hairstyle_a");
      expect(mapping.label).toBe("Outfit");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(58);
      expect(mapping.category).toBe("character");
    });

    it("has expected endPatterns count", () => {
      expect(mapping.endPatterns.length).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // outfit_hairstyle_b
  // -----------------------------------------------------------------------
  describe("outfit_hairstyle_b", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "outfit_hairstyle_b",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Hairstyle'", () => {
      expect(mapping.startPattern.test("- Hairstyle")).toBe(true);
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("outfit_hairstyle_b");
      expect(mapping.label).toBe("Hairstyle");
      expect(mapping.policy).toEqual({ type: "every_n", n: 2 });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(59);
      expect(mapping.category).toBe("character");
    });

    it("has expected endPatterns count", () => {
      expect(mapping.endPatterns.length).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // relationship_status
  // -----------------------------------------------------------------------
  describe("relationship_status", () => {
    const mapping = SUB_SECTION_MAPPINGS.find(
      (m) => m.id === "relationship_status",
    )!;

    it("exists", () => {
      expect(mapping).toBeDefined();
    });

    it("startPattern matches '- Initial relationship status'", () => {
      expect(mapping.startPattern.test("- Initial relationship status")).toBe(
        true,
      );
    });

    it("has correct metadata", () => {
      expect(mapping.id).toBe("relationship_status");
      expect(mapping.label).toBe("Initial Relationship Status");
      expect(mapping.policy).toEqual({
        type: "on_state_field",
        field: "relationships",
      });
      expect(mapping.priority).toBe("normal");
      expect(mapping.order).toBe(70);
      expect(mapping.category).toBe("world");
    });

    it("has expected endPatterns count", () => {
      expect(mapping.endPatterns.length).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// MERGE_GROUPS
// ---------------------------------------------------------------------------

describe("MERGE_GROUPS", () => {
  it("has expected number of groups", () => {
    expect(MERGE_GROUPS).toHaveLength(2);
  });

  describe("vocabulary_humor merge group", () => {
    const group = MERGE_GROUPS.find((g) => g.merged.id === "vocabulary_humor")!;

    it("exists", () => {
      expect(group).toBeDefined();
    });

    it("has correct sourceIds", () => {
      expect(group.sourceIds).toEqual([
        "vocabulary_humor_a",
        "vocabulary_humor_b",
        "vocabulary_humor_c",
        "vocabulary_humor_d",
      ]);
    });

    it("has correct merged metadata", () => {
      expect(group.merged.id).toBe("vocabulary_humor");
      expect(group.merged.label).toBe("Vocabulary & Humor");
      expect(group.merged.policy).toEqual({ type: "every_n", n: 2 });
      expect(group.merged.priority).toBe("high");
      expect(group.merged.order).toBe(45);
      expect(group.merged.category).toBe("character");
    });
  });

  describe("outfit_hairstyle merge group", () => {
    const group = MERGE_GROUPS.find((g) => g.merged.id === "outfit_hairstyle")!;

    it("exists", () => {
      expect(group).toBeDefined();
    });

    it("has correct sourceIds", () => {
      expect(group.sourceIds).toEqual([
        "outfit_hairstyle_a",
        "outfit_hairstyle_b",
      ]);
    });

    it("has correct merged metadata", () => {
      expect(group.merged.id).toBe("outfit_hairstyle");
      expect(group.merged.label).toBe("Outfit & Hairstyle");
      expect(group.merged.policy).toEqual({ type: "every_n", n: 2 });
      expect(group.merged.priority).toBe("normal");
      expect(group.merged.order).toBe(56);
      expect(group.merged.category).toBe("character");
    });
  });
});
