export interface Entity {
  id: string;
  name: string;
  description: string;
  isPlayerCharacter: boolean;
}

export type AttributeCategory =
  | "face"
  | "hair"
  | "build"
  | "outfit"
  | "voice"
  | "scent"
  | "movement"
  | "presence";

export type FactTag =
  | "biographical"
  | "spatial"
  | "relational"
  | "temporal"
  | "world"
  | "event";

export type RelationshipTone =
  | "hostile"
  | "cold"
  | "neutral"
  | "warm"
  | "close"
  | "intimate";

export type BehavioralCategory =
  | "speech"
  | "vocabulary"
  | "humor"
  | "directness"
  | "emotion"
  | "physicality"
  | "interaction"
  | "quirks";

export interface Relationship {
  fromEntityId: string;
  toEntityId: string;
  description: string;
  details: string[];
  tone?: RelationshipTone;
}

export interface AppearanceEntry {
  entityId: string;
  attribute: string;
  description: string;
  category?: AttributeCategory;
}

export interface SceneInfo {
  location: string;
  presentEntityIds: string[];
  atmosphere: string;
}

export interface DemeanorEntry {
  entityId: string;
  mood: string;
  energy: string;
}

export interface StoryThread {
  id: string;
  description: string;
  hook?: string;
  resolutionHint: string;
  closureRationale?: string;
  lifecycleRejection?: string;
  lastReferencedAt?: string;
  status: "active" | "evolved" | "resolved" | "stale";
  evolvedInto?: string;
  createdAt?: string;
}

export interface HardFact {
  fact: string;
  summary?: string;
  tags?: FactTag[];
  establishedAt?: string;
  lastConfirmedAt?: string;
  superseded: boolean;
  supersededBy?: string;
  lifecycleRejection?: string;
  createdAt?: string;
}

export interface CustomSection {
  heading: string;
  content: string;
}

export interface SectionMeta {
  lastUpdatedAt: number;
  updateCount: number;
}

export type SectionMetaKey =
  | "cast"
  | "relationships"
  | "characters"
  | "scene"
  | "demeanor"
  | "openThreads"
  | "hardFacts"
  | "style"
  | "custom";

const SECTION_META_KEYS: readonly SectionMetaKey[] = [
  "cast",
  "relationships",
  "characters",
  "scene",
  "demeanor",
  "openThreads",
  "hardFacts",
  "style",
  "custom",
];

export interface StructuredStoryState {
  entities: Entity[];
  relationships: Relationship[];
  appearance: AppearanceEntry[];
  scene: SceneInfo;
  demeanor: DemeanorEntry[];
  openThreads: StoryThread[];
  hardFacts: HardFact[];
  style: string[];
  custom: CustomSection[];
  sectionMeta: Record<string, SectionMeta>;
}

export function emptySectionMeta(): Record<string, SectionMeta> {
  return Object.fromEntries(
    SECTION_META_KEYS.map((key) => [
      key,
      {
        lastUpdatedAt: 0,
        updateCount: 0,
      },
    ]),
  );
}

export function normalizeSectionMeta(
  sectionMeta: Record<string, SectionMeta> | undefined,
): Record<string, SectionMeta> {
  const base = emptySectionMeta();
  if (!sectionMeta) return base;

  const merged = { ...base, ...sectionMeta };
  for (const [key, value] of Object.entries(merged)) {
    merged[key] = {
      lastUpdatedAt:
        Number.isFinite(value?.lastUpdatedAt) && value.lastUpdatedAt > 0
          ? Math.floor(value.lastUpdatedAt)
          : 0,
      updateCount:
        Number.isFinite(value?.updateCount) && value.updateCount > 0
          ? Math.floor(value.updateCount)
          : 0,
    };
  }
  return merged;
}

type SectionSnapshot = Record<SectionMetaKey, string>;

function sectionSnapshots(state: StructuredStoryState): SectionSnapshot {
  return {
    cast: JSON.stringify(state.entities),
    relationships: JSON.stringify(state.relationships),
    characters: JSON.stringify(state.appearance),
    scene: JSON.stringify(state.scene),
    demeanor: JSON.stringify(state.demeanor),
    openThreads: JSON.stringify(state.openThreads),
    hardFacts: JSON.stringify(state.hardFacts),
    style: JSON.stringify(state.style),
    custom: JSON.stringify(state.custom),
  };
}

function bumpSectionMeta(
  previousMeta: Record<string, SectionMeta>,
  key: SectionMetaKey,
  turnNumber: number,
): SectionMeta {
  const previous = previousMeta[key] ?? { lastUpdatedAt: 0, updateCount: 0 };
  const turn = turnNumber > 0 ? turnNumber : previous.lastUpdatedAt;
  return {
    lastUpdatedAt: turn,
    updateCount: previous.updateCount + 1,
  };
}

export function applySectionMetaTransition(
  previous: StructuredStoryState | null,
  incoming: StructuredStoryState,
  turnNumber: number,
): StructuredStoryState {
  const previousMeta = normalizeSectionMeta(previous?.sectionMeta);
  if (!previous) {
    return {
      ...incoming,
      sectionMeta: normalizeSectionMeta(incoming.sectionMeta),
    };
  }

  const before = sectionSnapshots(previous);
  const after = sectionSnapshots(incoming);
  const nextMeta = normalizeSectionMeta(previousMeta);

  for (const key of SECTION_META_KEYS) {
    if (before[key] === after[key]) continue;
    nextMeta[key] = bumpSectionMeta(previousMeta, key, turnNumber);
  }

  return {
    ...incoming,
    sectionMeta: nextMeta,
  };
}

export function emptyStructuredState(): StructuredStoryState {
  return {
    entities: [],
    relationships: [],
    appearance: [],
    scene: { location: "", presentEntityIds: [], atmosphere: "" },
    demeanor: [],
    openThreads: [],
    hardFacts: [],
    style: [],
    custom: [],
    sectionMeta: emptySectionMeta(),
  };
}
