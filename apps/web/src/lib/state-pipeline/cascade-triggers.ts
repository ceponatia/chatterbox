/**
 * Cascade triggers — fact types that force-include specific segments.
 *
 * When certain fact types are extracted, related prompt segments should be
 * re-injected on the next turn regardless of their normal policy schedule.
 * This is done by resetting their `lastIncludedAt` entry to 0, making
 * every_n and on_topic policies fire immediately.
 */

import type { StatePipelineChange } from "@chatterbox/sockets";

/**
 * Map of fact types to segment IDs that should be refreshed.
 * When a fact of the given type is extracted, the listed segments
 * will have their lastIncludedAt reset to 0.
 */
const TRIGGER_MAP: Record<string, readonly string[]> = {
  scene_change: ["appearance_visual", "outfit_hairstyle", "setting_premise"],
  appearance_change: ["appearance_visual", "outfit_hairstyle"],
  cast_change: ["relationship_status", "interaction_guide", "backstory"],
  relationship_shift: ["relationship_status", "backstory", "interaction_guide"],
  hard_fact_superseded: ["relationship_status"],
  scene_reverted: ["appearance_visual", "outfit_hairstyle", "setting_premise"],
  appearance_reverted: ["appearance_visual", "outfit_hairstyle"],
  relationship_reverted: ["relationship_status", "backstory"],
  hard_fact_removed: ["relationship_status"],
  thread_removed: ["interaction_guide"],
  correction: [
    "appearance_visual",
    "outfit_hairstyle",
    "setting_premise",
    "interaction_guide",
  ],
  character_enters: [],
  character_leaves: [],
};

interface CharacterSegmentLookup {
  [entityId: string]: string;
}

/**
 * Given extracted facts, return segment IDs whose lastIncludedAt should
 * be reset to 0 so they are re-injected on the next turn.
 */
function parseEntityIdFromDetail(detail: string): string | null {
  const text = detail.trim();
  const idMatch = text.match(/\b(e-[a-z0-9-]{6,})\b/i);
  if (idMatch?.[1]) return idMatch[1];

  const parenMatch = text.match(/\((e-[a-z0-9-]{6,})\)/i);
  if (parenMatch?.[1]) return parenMatch[1];

  return null;
}

export function computeCascadeResets(
  facts: StatePipelineChange[],
  characterSegmentIds?: CharacterSegmentLookup,
): string[] {
  const resets = new Set<string>();
  for (const fact of facts) {
    const segments = TRIGGER_MAP[fact.type];
    if (segments) {
      for (const id of segments) resets.add(id);
    }

    if (
      characterSegmentIds &&
      (fact.type === "character_enters" || fact.type === "character_leaves")
    ) {
      const entityId = parseEntityIdFromDetail(fact.detail);
      if (entityId) {
        const segmentId = characterSegmentIds[entityId];
        if (segmentId) resets.add(segmentId);
      } else {
        for (const segmentId of Object.values(characterSegmentIds)) {
          resets.add(segmentId);
        }
      }
    }
  }
  return [...resets];
}
