import { emptyStructuredState, type StructuredStoryState } from "./types.js";

export interface EffectiveStateInput {
  baseline: StructuredStoryState | null;
  runtime: StructuredStoryState | null;
}

function pickList<T>(runtimeList: T[], baselineList: T[]): T[] {
  return runtimeList.length > 0 ? runtimeList : baselineList;
}

export function resolveEffectiveState({
  baseline,
  runtime,
}: EffectiveStateInput): StructuredStoryState {
  if (!baseline && !runtime) return emptyStructuredState();
  if (!baseline) return runtime ?? emptyStructuredState();
  if (!runtime) return baseline;

  return {
    entities: pickList(runtime.entities, baseline.entities),
    relationships: pickList(runtime.relationships, baseline.relationships),
    appearance: pickList(runtime.appearance, baseline.appearance),
    scene: {
      location: runtime.scene.location || baseline.scene.location,
      presentEntityIds: pickList(
        runtime.scene.presentEntityIds,
        baseline.scene.presentEntityIds,
      ),
      atmosphere: runtime.scene.atmosphere || baseline.scene.atmosphere,
    },
    demeanor: pickList(runtime.demeanor, baseline.demeanor),
    openThreads: pickList(runtime.openThreads, baseline.openThreads),
    hardFacts: pickList(runtime.hardFacts, baseline.hardFacts),
    style: pickList(runtime.style, baseline.style),
    custom: pickList(runtime.custom, baseline.custom),
    sectionMeta: runtime.sectionMeta,
  };
}
