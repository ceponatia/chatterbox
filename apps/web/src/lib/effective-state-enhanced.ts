/**
 * Tier-aware effective state resolution.
 *
 * Wraps the base `resolveEffectiveState` from @chatterbox/state-model with
 * field-level mutability tiers:
 *
 *   - **baseline-only**: entity core fields (name, description,
 *     isPlayerCharacter) are preserved from baseline, never overwritten by
 *     runtime.
 *   - **semi-stable**: relationships, appearance, demeanor -- runtime updates
 *     are accepted but baseline fills gaps.
 *   - **mutable**: scene, threads, facts, style, custom -- fully
 *     runtime-controlled; baseline is a fallback when runtime is empty.
 */

import {
  resolveEffectiveState,
  type EffectiveStateInput,
  type StructuredStoryState,
  type Entity,
  type Relationship,
  type AppearanceEntry,
  type DemeanorEntry,
} from "@chatterbox/state-model";

// ---------------------------------------------------------------------------
// Baseline-only: entity core fields
// ---------------------------------------------------------------------------

/**
 * Merge entity lists preserving baseline core fields (name, description,
 * isPlayerCharacter) while allowing runtime to add new entities.
 */
function mergeEntities(baseline: Entity[], runtime: Entity[]): Entity[] {
  if (runtime.length === 0) return baseline;

  const baseMap = new Map(baseline.map((e) => [e.id, e]));
  const merged: Entity[] = runtime.map((rt) => {
    const base = baseMap.get(rt.id);
    if (!base) return rt; // new runtime entity
    return {
      ...rt,
      name: base.name,
      description: base.description,
      isPlayerCharacter: base.isPlayerCharacter,
    };
  });

  // Preserve baseline entities absent from runtime
  for (const base of baseline) {
    if (!merged.some((e) => e.id === base.id)) {
      merged.push(base);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Semi-stable: merge with runtime precedence, baseline gap-fill
// ---------------------------------------------------------------------------

function mergeRelationships(
  baseline: Relationship[],
  runtime: Relationship[],
): Relationship[] {
  if (runtime.length === 0) return baseline;

  const key = (r: Relationship) => `${r.fromEntityId}:${r.toEntityId}`;
  const runtimeMap = new Map(runtime.map((r) => [key(r), r]));
  const merged = [...runtime];

  for (const base of baseline) {
    if (!runtimeMap.has(key(base))) {
      merged.push(base);
    }
  }

  return merged;
}

function mergeAppearance(
  baseline: AppearanceEntry[],
  runtime: AppearanceEntry[],
): AppearanceEntry[] {
  if (runtime.length === 0) return baseline;

  const key = (a: AppearanceEntry) => `${a.entityId}:${a.attribute}`;
  const runtimeMap = new Map(runtime.map((a) => [key(a), a]));
  const merged = [...runtime];

  for (const base of baseline) {
    if (!runtimeMap.has(key(base))) {
      merged.push(base);
    }
  }

  return merged;
}

function mergeDemeanor(
  baseline: DemeanorEntry[],
  runtime: DemeanorEntry[],
): DemeanorEntry[] {
  if (runtime.length === 0) return baseline;

  const runtimeMap = new Map(runtime.map((d) => [d.entityId, d]));
  const merged = [...runtime];

  for (const base of baseline) {
    if (!runtimeMap.has(base.entityId)) {
      merged.push(base);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveEffectiveStateWithTiers(
  input: EffectiveStateInput,
): StructuredStoryState {
  const { baseline, runtime } = input;

  // Delegate to the base resolver for null handling
  if (!baseline || !runtime) return resolveEffectiveState(input);

  // Start from the base resolver for mutable fields, then overlay tiers
  const base = resolveEffectiveState(input);

  return {
    ...base,
    // Baseline-only: entity core fields preserved from baseline
    entities: mergeEntities(baseline.entities, runtime.entities),
    // Semi-stable: runtime takes precedence per key, baseline fills gaps
    relationships: mergeRelationships(
      baseline.relationships,
      runtime.relationships,
    ),
    appearance: mergeAppearance(baseline.appearance, runtime.appearance),
    demeanor: mergeDemeanor(baseline.demeanor, runtime.demeanor),
    // Mutable fields (scene, threads, facts, style, custom, sectionMeta)
    // are already handled correctly by the base resolver (runtime-first,
    // baseline fallback) so we keep them from `base`.
  };
}
