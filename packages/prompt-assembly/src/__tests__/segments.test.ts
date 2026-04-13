import { describe, it, expect } from "vitest";
import {
  DEFAULT_SEGMENTS,
  createDefaultAssembler,
  coreRulesSegment,
  narrationGuidelinesSegment,
  outputFormatSegment,
  settingPremiseSegment,
  characterIdentitySegment,
  speechPatternsSegment,
  vocabularyHumorSegment,
  mannerismsSegment,
  appearanceVisualSegment,
  outfitHairstyleSegment,
  voiceSoundSegment,
  backstorySegment,
  interactionGuideSegment,
  relationshipStatusSegment,
} from "../segments";

describe("DEFAULT_SEGMENTS", () => {
  it("is a non-empty array", () => {
    expect(DEFAULT_SEGMENTS.length).toBeGreaterThan(0);
  });

  it("all segments have unique IDs", () => {
    const ids = DEFAULT_SEGMENTS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("all segments have valid priority values", () => {
    const validPriorities = new Set(["critical", "high", "normal", "low"]);
    for (const seg of DEFAULT_SEGMENTS) {
      expect(validPriorities.has(seg.priority)).toBe(true);
    }
  });

  it("all segments have non-empty content", () => {
    for (const seg of DEFAULT_SEGMENTS) {
      expect(seg.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("all segments have positive tokenEstimate", () => {
    for (const seg of DEFAULT_SEGMENTS) {
      expect(seg.tokenEstimate).toBeGreaterThan(0);
    }
  });

  it("all segments have a category", () => {
    for (const seg of DEFAULT_SEGMENTS) {
      expect(seg.category.length).toBeGreaterThan(0);
    }
  });

  it("all segments have a label", () => {
    for (const seg of DEFAULT_SEGMENTS) {
      expect(seg.label.length).toBeGreaterThan(0);
    }
  });

  it("all segments have an id", () => {
    for (const seg of DEFAULT_SEGMENTS) {
      expect(seg.id.length).toBeGreaterThan(0);
    }
  });

  // Spot-check specific segments
  it("core_rules has always policy and critical priority", () => {
    const seg = DEFAULT_SEGMENTS.find((s) => s.id === "core_rules");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("always");
    expect(seg!.priority).toBe("critical");
  });

  it("backstory has on_topic policy", () => {
    const seg = DEFAULT_SEGMENTS.find((s) => s.id === "backstory");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("on_topic");
    if (seg!.policy.type === "on_topic") {
      expect(seg!.policy.keywords.length).toBeGreaterThan(0);
    }
  });

  it("relationship_status has on_state_field policy", () => {
    const seg = DEFAULT_SEGMENTS.find((s) => s.id === "relationship_status");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("on_state_field");
    if (seg!.policy.type === "on_state_field") {
      expect(seg!.policy.field).toBe("relationships");
    }
  });

  it("speech_patterns has every_n policy", () => {
    const seg = DEFAULT_SEGMENTS.find((s) => s.id === "speech_patterns");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("every_n");
    if (seg!.policy.type === "every_n") {
      expect(seg!.policy.n).toBe(2);
    }
  });

  it("output_format has always policy and critical priority", () => {
    const seg = DEFAULT_SEGMENTS.find((s) => s.id === "output_format");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("always");
    expect(seg!.priority).toBe("critical");
  });

  it("setting_premise has always policy and critical priority", () => {
    const seg = DEFAULT_SEGMENTS.find((s) => s.id === "setting_premise");
    expect(seg).toBeDefined();
    expect(seg!.policy.type).toBe("always");
    expect(seg!.priority).toBe("critical");
  });

  // -------------------------------------------------------------------------
  // Exact metadata verification for each segment
  // -------------------------------------------------------------------------

  describe("coreRulesSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(coreRulesSegment.id).toBe("core_rules");
      expect(coreRulesSegment.label).toBe("Core Narration Rules");
      expect(coreRulesSegment.category).toBe("rules");
      expect(coreRulesSegment.order).toBe(0);
      expect(coreRulesSegment.priority).toBe("critical");
      expect(coreRulesSegment.tokenEstimate).toBe(320);
    });
  });

  describe("narrationGuidelinesSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(narrationGuidelinesSegment.id).toBe("narration_guidelines");
      expect(narrationGuidelinesSegment.label).toBe("Narration Guidelines");
      expect(narrationGuidelinesSegment.category).toBe("rules");
      expect(narrationGuidelinesSegment.order).toBe(5);
      expect(narrationGuidelinesSegment.priority).toBe("normal");
      expect(narrationGuidelinesSegment.tokenEstimate).toBe(90);
    });

    it("has every_n(3) policy", () => {
      expect(narrationGuidelinesSegment.policy).toEqual({
        type: "every_n",
        n: 3,
      });
    });
  });

  describe("outputFormatSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(outputFormatSegment.id).toBe("output_format");
      expect(outputFormatSegment.label).toBe("Output Format");
      expect(outputFormatSegment.category).toBe("rules");
      expect(outputFormatSegment.order).toBe(10);
      expect(outputFormatSegment.priority).toBe("critical");
      expect(outputFormatSegment.tokenEstimate).toBe(250);
    });
  });

  describe("settingPremiseSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(settingPremiseSegment.id).toBe("setting_premise");
      expect(settingPremiseSegment.label).toBe("Setting & Premise");
      expect(settingPremiseSegment.category).toBe("world");
      expect(settingPremiseSegment.order).toBe(20);
      expect(settingPremiseSegment.priority).toBe("critical");
      expect(settingPremiseSegment.tokenEstimate).toBe(80);
    });
  });

  describe("characterIdentitySegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(characterIdentitySegment.id).toBe("character_identity");
      expect(characterIdentitySegment.label).toBe("Character Identity");
      expect(characterIdentitySegment.category).toBe("character");
      expect(characterIdentitySegment.order).toBe(30);
      expect(characterIdentitySegment.priority).toBe("critical");
      expect(characterIdentitySegment.tokenEstimate).toBe(120);
    });
  });

  describe("speechPatternsSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(speechPatternsSegment.id).toBe("speech_patterns");
      expect(speechPatternsSegment.label).toBe("Speech Patterns & Voice");
      expect(speechPatternsSegment.category).toBe("character");
      expect(speechPatternsSegment.order).toBe(40);
      expect(speechPatternsSegment.priority).toBe("high");
      expect(speechPatternsSegment.tokenEstimate).toBe(350);
    });

    it("has every_n(2) policy", () => {
      expect(speechPatternsSegment.policy).toEqual({
        type: "every_n",
        n: 2,
      });
    });
  });

  describe("vocabularyHumorSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(vocabularyHumorSegment.id).toBe("vocabulary_humor");
      expect(vocabularyHumorSegment.label).toBe("Vocabulary & Humor");
      expect(vocabularyHumorSegment.category).toBe("character");
      expect(vocabularyHumorSegment.order).toBe(45);
      expect(vocabularyHumorSegment.priority).toBe("high");
      expect(vocabularyHumorSegment.tokenEstimate).toBe(200);
    });

    it("has every_n(2) policy", () => {
      expect(vocabularyHumorSegment.policy).toEqual({
        type: "every_n",
        n: 2,
      });
    });
  });

  describe("mannerismsSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(mannerismsSegment.id).toBe("mannerisms");
      expect(mannerismsSegment.label).toBe("Mannerisms & Physical Beats");
      expect(mannerismsSegment.category).toBe("character");
      expect(mannerismsSegment.order).toBe(50);
      expect(mannerismsSegment.priority).toBe("normal");
      expect(mannerismsSegment.tokenEstimate).toBe(150);
    });

    it("has every_n(3) policy", () => {
      expect(mannerismsSegment.policy).toEqual({ type: "every_n", n: 3 });
    });
  });

  describe("appearanceVisualSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(appearanceVisualSegment.id).toBe("appearance_visual");
      expect(appearanceVisualSegment.label).toBe(
        "Appearance & Visual Presence",
      );
      expect(appearanceVisualSegment.category).toBe("character");
      expect(appearanceVisualSegment.order).toBe(55);
      expect(appearanceVisualSegment.priority).toBe("normal");
      expect(appearanceVisualSegment.tokenEstimate).toBe(300);
    });

    it("has every_n(2) policy", () => {
      expect(appearanceVisualSegment.policy).toEqual({
        type: "every_n",
        n: 2,
      });
    });
  });

  describe("outfitHairstyleSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(outfitHairstyleSegment.id).toBe("outfit_hairstyle");
      expect(outfitHairstyleSegment.label).toBe("Outfit & Hairstyle");
      expect(outfitHairstyleSegment.category).toBe("character");
      expect(outfitHairstyleSegment.order).toBe(56);
      expect(outfitHairstyleSegment.priority).toBe("normal");
      expect(outfitHairstyleSegment.tokenEstimate).toBe(250);
    });

    it("has every_n(2) policy", () => {
      expect(outfitHairstyleSegment.policy).toEqual({
        type: "every_n",
        n: 2,
      });
    });
  });

  describe("voiceSoundSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(voiceSoundSegment.id).toBe("voice_sound");
      expect(voiceSoundSegment.label).toBe("Voice Description (Sound)");
      expect(voiceSoundSegment.category).toBe("character");
      expect(voiceSoundSegment.order).toBe(57);
      expect(voiceSoundSegment.priority).toBe("normal");
      expect(voiceSoundSegment.tokenEstimate).toBe(200);
    });

    it("has every_n(2) policy", () => {
      expect(voiceSoundSegment.policy).toEqual({ type: "every_n", n: 2 });
    });
  });

  describe("backstorySegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(backstorySegment.id).toBe("backstory");
      expect(backstorySegment.label).toBe(
        "Background & Relationship to Player",
      );
      expect(backstorySegment.category).toBe("world");
      expect(backstorySegment.order).toBe(60);
      expect(backstorySegment.priority).toBe("normal");
      expect(backstorySegment.tokenEstimate).toBe(200);
    });

    it("has on_topic policy with all 12 keywords", () => {
      expect(backstorySegment.policy).toEqual({
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

  describe("interactionGuideSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(interactionGuideSegment.id).toBe("interaction_guide");
      expect(interactionGuideSegment.label).toBe("Interaction Guidelines");
      expect(interactionGuideSegment.category).toBe("character");
      expect(interactionGuideSegment.order).toBe(65);
      expect(interactionGuideSegment.priority).toBe("normal");
      expect(interactionGuideSegment.tokenEstimate).toBe(300);
    });

    it("has every_n(3) policy", () => {
      expect(interactionGuideSegment.policy).toEqual({
        type: "every_n",
        n: 3,
      });
    });
  });

  describe("relationshipStatusSegment exact metadata", () => {
    it("has correct id, label, category, order, priority", () => {
      expect(relationshipStatusSegment.id).toBe("relationship_status");
      expect(relationshipStatusSegment.label).toBe(
        "Initial Relationship Status",
      );
      expect(relationshipStatusSegment.category).toBe("world");
      expect(relationshipStatusSegment.order).toBe(70);
      expect(relationshipStatusSegment.priority).toBe("normal");
      expect(relationshipStatusSegment.tokenEstimate).toBe(100);
    });

    it("has on_state_field policy with relationships field", () => {
      expect(relationshipStatusSegment.policy).toEqual({
        type: "on_state_field",
        field: "relationships",
      });
    });
  });
});

describe("createDefaultAssembler", () => {
  it("returns an assembler with all default segments registered", () => {
    const assembler = createDefaultAssembler();
    const listed = assembler.listSegments();
    expect(listed).toHaveLength(DEFAULT_SEGMENTS.length);
  });

  it("assembler contains all default segment IDs", () => {
    const assembler = createDefaultAssembler();
    const listedIds = new Set(assembler.listSegments().map((s) => s.id));
    for (const seg of DEFAULT_SEGMENTS) {
      expect(listedIds.has(seg.id)).toBe(true);
    }
  });

  it("assembler produces a result when assembled", () => {
    const assembler = createDefaultAssembler();
    const result = assembler.assemble({
      turnNumber: 1,
      lastIncludedAt: {},
      currentUserMessage: "",
      stateFields: {},
      tokenBudget: 10000,
    });
    expect(result.systemPrompt.length).toBeGreaterThan(0);
    expect(result.included.length).toBeGreaterThan(0);
  });
});
