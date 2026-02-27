/**
 * Segment registry — exports all default segments and provides a factory
 * that creates a pre-configured PromptAssembler with all segments registered.
 */

import { PromptAssembler } from "../assembler";
import { coreRulesSegment } from "./core-rules";
import { narrationGuidelinesSegment } from "./narration-guidelines";
import { outputFormatSegment } from "./output-format";
import { settingPremiseSegment } from "./setting-premise";
import { characterIdentitySegment } from "./character-identity";
import { speechPatternsSegment } from "./speech-patterns";
import { vocabularyHumorSegment } from "./vocabulary-humor";
import { mannerismsSegment } from "./mannerisms";
import { appearanceVisualSegment } from "./appearance-visual";
import { outfitHairstyleSegment } from "./outfit-hairstyle";
import { voiceSoundSegment } from "./voice-sound";
import { backstorySegment } from "./backstory";
import { interactionGuideSegment } from "./interaction-guide";
import { relationshipStatusSegment } from "./relationship-status";
import type { PromptSegment } from "../types";

/** All default segments in registration order. */
export const DEFAULT_SEGMENTS: readonly PromptSegment[] = [
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
];

/** Create a PromptAssembler pre-loaded with all default segments. */
export function createDefaultAssembler(): PromptAssembler {
  const assembler = new PromptAssembler();
  for (const segment of DEFAULT_SEGMENTS) {
    assembler.register(segment);
  }
  return assembler;
}

// Re-export individual segments for selective use
export { coreRulesSegment } from "./core-rules";
export { narrationGuidelinesSegment } from "./narration-guidelines";
export { outputFormatSegment } from "./output-format";
export { settingPremiseSegment } from "./setting-premise";
export { characterIdentitySegment } from "./character-identity";
export { speechPatternsSegment } from "./speech-patterns";
export { vocabularyHumorSegment } from "./vocabulary-humor";
export { mannerismsSegment } from "./mannerisms";
export { appearanceVisualSegment } from "./appearance-visual";
export { outfitHairstyleSegment } from "./outfit-hairstyle";
export { voiceSoundSegment } from "./voice-sound";
export { backstorySegment } from "./backstory";
export { interactionGuideSegment } from "./interaction-guide";
export { relationshipStatusSegment } from "./relationship-status";
