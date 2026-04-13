import { parseSystemPromptToSegments } from "@chatterbox/prompt-assembly";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaults";
import type { PromptBlueprint } from "@/lib/story-project-types";

let cachedDefaults: PromptBlueprint | null = null;

export function getDefaultBlueprintContent(): PromptBlueprint {
  if (cachedDefaults) return cachedDefaults;

  const segments = parseSystemPromptToSegments(DEFAULT_SYSTEM_PROMPT);
  const segmentMap = new Map(segments.map((s) => [s.id, s.content]));

  cachedDefaults = {
    setting: segmentMap.get("setting_premise") ?? "",
    themes: "",
    coreRules: segmentMap.get("core_rules") ?? "",
    outputFormat: segmentMap.get("output_format") ?? "",
    npcFraming: segmentMap.get("npc_framing") ?? "",
    narrationGuidelines: segmentMap.get("narration_guidelines") ?? "",
    interactionGuidelines: segmentMap.get("interaction_guide") ?? "",
    customSections: [],
    customizedFields: {},
  };
  return cachedDefaults;
}
