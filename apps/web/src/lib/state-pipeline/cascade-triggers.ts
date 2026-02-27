/**
 * Cascade triggers — fact types that force-include specific segments.
 *
 * When certain fact types are extracted, related prompt segments should be
 * re-injected on the next turn regardless of their normal policy schedule.
 * This is done by resetting their `lastIncludedAt` entry to 0, making
 * every_n and on_topic policies fire immediately.
 */

import type { ExtractedFact } from "@/lib/state-history";

/**
 * Map of fact types to segment IDs that should be refreshed.
 * When a fact of the given type is extracted, the listed segments
 * will have their lastIncludedAt reset to 0.
 */
const TRIGGER_MAP: Record<string, readonly string[]> = {
  scene_change: ["appearance_visual", "outfit_hairstyle", "setting_premise"],
  appearance_change: ["appearance_visual", "outfit_hairstyle"],
  cast_change: ["relationship_status", "interaction_guide"],
  relationship_shift: ["relationship_status", "backstory"],
  hard_fact_superseded: ["relationship_status"],
  correction: [
    "appearance_visual",
    "outfit_hairstyle",
    "setting_premise",
    "interaction_guide",
  ],
};

/**
 * Given extracted facts, return segment IDs whose lastIncludedAt should
 * be reset to 0 so they are re-injected on the next turn.
 */
export function computeCascadeResets(facts: ExtractedFact[]): string[] {
  const resets = new Set<string>();
  for (const fact of facts) {
    const segments = TRIGGER_MAP[fact.type];
    if (segments) {
      for (const id of segments) resets.add(id);
    }
  }
  return [...resets];
}
