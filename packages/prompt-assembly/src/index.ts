/**
 * @chatterbox/prompt-assembly — Public API
 *
 * This is the ONLY entry point for consuming prompt assembly types and defaults.
 * All imports from @chatterbox/prompt-assembly must go through this barrel.
 */

// Core types
export type { PromptSegment, InjectionPolicy, SegmentPriority, AssemblyContext, AssemblyResult } from "./types";

// Assembler
export { PromptAssembler } from "./assembler";

// Helpers
export { estimateTokens } from "./token-estimator";
export { matchesTopicKeywords } from "./topic-detector";

// Segments
export { DEFAULT_SEGMENTS, createDefaultAssembler } from "./segments";
export {
  coreRulesSegment,
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
} from "./segments";

// Socket-compatible implementation
export { segmentedPromptAssembly } from "./socket-adapter";
