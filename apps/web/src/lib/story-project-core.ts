import {
  estimateTokens,
  parseSystemPromptToSegments,
  segmentsToMarkdown,
  type SerializedSegment,
} from "@chatterbox/prompt-assembly";
import {
  buildCharacterBehaviorSegment,
  inferCharacterNameFromMarkdown,
} from "@/lib/character-markdown";
import {
  deriveAppearanceEntries,
  deriveBehaviorSegment,
  deriveDemeanorEntry,
  deriveEntity,
} from "@/lib/character-derivation";
import { DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPT } from "@/lib/defaults";
import {
  emptyStructuredState,
  parseMarkdownToStructured,
  remapEntityIds,
  structuredToMarkdown,
  type StructuredStoryState,
} from "@chatterbox/state-model";
import type {
  SegmentOverrides,
  StoryAuthoringMode,
  StoryCharacterRecord,
  StoryProjectArtifacts,
  StoryProjectDetail,
  StoryProjectExportPayload,
  StoryProjectImportCharacterInput,
  StoryRelationshipRecord,
} from "@/lib/story-project-types";

interface StoryProjectGenerationSource {
  importedSystemPrompt: string | null;
  importedStoryState: string | null;
  characters: StoryCharacterRecord[];
  relationships: StoryRelationshipRecord[];
  segmentOverrides: SegmentOverrides | null;
}

export function createStoryCharacterEntityId(): string {
  return crypto.randomUUID();
}

function normalizeRole(role: string): string {
  const trimmed = role.trim();
  return trimmed.length > 0 ? trimmed : "supporting";
}

function upsertSegment(
  segments: SerializedSegment[],
  segment: SerializedSegment,
): SerializedSegment[] {
  const next = [...segments];
  const existingIndex = next.findIndex((item) => item.id === segment.id);
  if (existingIndex >= 0) next[existingIndex] = segment;
  else next.push(segment);
  return next;
}

function upsertPlayerIdentitySegment(
  segments: SerializedSegment[],
  characters: StoryCharacterRecord[],
): SerializedSegment[] {
  const playerCharacter = characters.find((character) => character.isPlayer);
  const playerName = playerCharacter?.name.trim();
  if (!playerName) return segments;

  const playerNote =
    `The player character is called "${playerName}". ` +
    `Any reference to {{ user }} or the player refers to ${playerName}. ` +
    `Apply all player-control rules (non-authorship, action boundaries) to ${playerName}.`;

  return upsertSegment(segments, {
    id: "player_identity",
    label: "Player Identity",
    content: playerNote,
    policy: { type: "always" },
    priority: "critical",
    order: 5,
    category: "rules",
    tokenEstimate: estimateTokens(playerNote),
  });
}

function alignStateEntitiesToCharacters(
  state: StructuredStoryState,
  characters: StoryCharacterRecord[],
): StructuredStoryState {
  if (characters.length === 0 || state.entities.length === 0) return state;

  const charactersByName = new Map(
    characters.map((character) => [
      character.name.trim().toLowerCase(),
      character,
    ]),
  );
  const idRemap: Record<string, string> = {};
  const entities = state.entities.map((entity) => {
    const match = charactersByName.get(entity.name.trim().toLowerCase());
    if (!match) return entity;
    if (entity.id !== match.entityId) idRemap[entity.id] = match.entityId;
    return {
      ...entity,
      id: match.entityId,
      name: match.name,
      description: entity.description || normalizeRole(match.role),
    };
  });

  return remapEntityIds({ ...state, entities }, idRemap);
}

function applyCharactersToState(
  state: StructuredStoryState,
  characters: StoryCharacterRecord[],
): StructuredStoryState {
  if (characters.length === 0) return state;

  const entities = [...state.entities];
  const entityIndex = new Map(
    entities.map((entity, index) => [entity.id, index]),
  );
  let appearance = [...state.appearance];
  let demeanor = [...state.demeanor];

  for (const character of characters) {
    const nextEntity = deriveEntity(character);
    const matchIndex = entityIndex.get(character.entityId);
    if (matchIndex !== undefined) {
      entities[matchIndex] = {
        ...entities[matchIndex],
        ...nextEntity,
        description:
          entities[matchIndex]?.description || nextEntity.description,
      };
    } else {
      entities.push(nextEntity);
    }

    if (character.appearance?.length) {
      appearance = appearance.filter(
        (entry) => entry.entityId !== character.entityId,
      );
      appearance.push(
        ...deriveAppearanceEntries(character.entityId, character.appearance),
      );
    }

    const demeanorEntry = deriveDemeanorEntry(
      character.entityId,
      character.startingDemeanor,
    );
    if (demeanorEntry) {
      demeanor = demeanor.filter(
        (entry) => entry.entityId !== character.entityId,
      );
      demeanor.push(demeanorEntry);
    }
  }

  const presentEntityIds =
    state.scene.presentEntityIds.length > 0
      ? state.scene.presentEntityIds
      : characters.map((character) => character.entityId);

  return {
    ...state,
    entities,
    appearance,
    demeanor,
    scene: {
      ...state.scene,
      presentEntityIds,
    },
  };
}

function applyRelationshipsToState(
  state: StructuredStoryState,
  relationships: StoryRelationshipRecord[],
): StructuredStoryState {
  return {
    ...state,
    relationships: relationships.map((relationship) => ({
      fromEntityId: relationship.fromEntityId,
      toEntityId: relationship.toEntityId,
      description: relationship.description,
      details: relationship.details,
      tone: relationship.tone ?? undefined,
    })),
  };
}

function buildGeneratedStructuredState(
  source: StoryProjectGenerationSource,
): StructuredStoryState {
  const parsed = source.importedStoryState?.trim()
    ? parseMarkdownToStructured(source.importedStoryState)
    : emptyStructuredState();

  const withAlignedEntities = alignStateEntitiesToCharacters(
    parsed,
    source.characters,
  );
  const withCharacters = applyCharactersToState(
    withAlignedEntities,
    source.characters,
  );
  return applyRelationshipsToState(withCharacters, source.relationships);
}

function upsertCharacterSegments(
  segments: SerializedSegment[],
  characters: StoryCharacterRecord[],
): SerializedSegment[] {
  let next = [...segments];
  for (const character of characters) {
    let segment = deriveBehaviorSegment(character);
    if (!segment && character.importedMarkdown) {
      segment = buildCharacterBehaviorSegment(
        character.importedMarkdown,
        character.entityId,
        character.name,
      );
    }
    if (!segment) continue;
    next = upsertSegment(next, segment);
  }
  return next;
}

function applySegmentOverrides(
  segments: SerializedSegment[],
  overrides: SegmentOverrides | null,
): SerializedSegment[] {
  if (!overrides) return segments;
  return segments.map((segment) => {
    const override = overrides[segment.id];
    if (override === undefined) return segment;
    return {
      ...segment,
      content: override,
      tokenEstimate: estimateTokens(override),
    };
  });
}

export function generateStoryProjectArtifacts(
  source: StoryProjectGenerationSource,
): StoryProjectArtifacts {
  const basePrompt = source.importedSystemPrompt?.trim()
    ? source.importedSystemPrompt
    : DEFAULT_SYSTEM_PROMPT;
  const baseSegments = parseSystemPromptToSegments(basePrompt);
  const withOverrides = applySegmentOverrides(
    baseSegments,
    source.segmentOverrides,
  );
  const characterSegments = upsertCharacterSegments(
    withOverrides,
    source.characters,
  );
  const generatedSegments = upsertPlayerIdentitySegment(
    characterSegments,
    source.characters,
  );
  const generatedStructuredState = buildGeneratedStructuredState(source);

  return {
    generatedSegments,
    generatedSystemPrompt: segmentsToMarkdown(generatedSegments),
    generatedStructuredState,
    generatedStoryState: structuredToMarkdown(generatedStructuredState),
  };
}

export function inferImportedCharacter(
  input: StoryProjectImportCharacterInput,
): { name: string; role: string; markdown: string } | null {
  const markdown = input.markdown.trim();
  if (!markdown) return null;

  const name = input.name?.trim() || inferCharacterNameFromMarkdown(markdown);
  if (!name) return null;

  return {
    name,
    role: normalizeRole(input.role ?? "supporting"),
    markdown,
  };
}

export function deriveAuthoringMode(options: {
  currentMode: StoryAuthoringMode;
  imported: boolean;
  hasStructuredEdits: boolean;
}): StoryAuthoringMode {
  if (options.imported && options.hasStructuredEdits) return "hybrid";
  if (options.imported) return "imported";
  return options.currentMode === "imported" ? "hybrid" : "form";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyString(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function getProvenanceValues(value: unknown): unknown[] {
  return isPlainObject(value) ? Object.values(value) : [];
}

function characterHasStructuredEdits(character: {
  importedMarkdown: string | null;
  isPlayer?: boolean;
  identity?: unknown;
  background?: string | null;
  appearance?: unknown;
  behavioralProfile?: unknown;
  startingDemeanor?: string | null;
  provenance?: unknown;
}): boolean {
  if (getProvenanceValues(character.provenance).includes("form")) return true;
  if (!hasNonEmptyString(character.importedMarkdown)) return true;
  if (character.isPlayer) return true;
  if (hasNonEmptyString(character.background)) return true;
  if (hasNonEmptyString(character.startingDemeanor)) return true;
  if (isPlainObject(character.identity)) return true;
  if (Array.isArray(character.appearance) && character.appearance.length > 0)
    return true;
  return isPlainObject(character.behavioralProfile);
}

export function resolveProjectAuthoringModeFromSource(options: {
  importedSystemPrompt: string | null;
  importedStoryState: string | null;
  characters: Array<{
    importedMarkdown: string | null;
    isPlayer?: boolean;
    identity?: unknown;
    background?: string | null;
    appearance?: unknown;
    behavioralProfile?: unknown;
    startingDemeanor?: string | null;
    provenance?: unknown;
  }>;
  hasStructuredEdits?: boolean;
}): StoryAuthoringMode {
  const hasImportedSource =
    Boolean(options.importedSystemPrompt?.trim()) ||
    Boolean(options.importedStoryState?.trim()) ||
    options.characters.some((character) =>
      Boolean(character.importedMarkdown?.trim()),
    );
  const structuredEdits =
    Boolean(options.hasStructuredEdits) ||
    options.characters.some(characterHasStructuredEdits);

  if (hasImportedSource && structuredEdits) return "hybrid";
  if (hasImportedSource) return "imported";
  return "form";
}

export function buildStoryProjectExport(
  project: StoryProjectDetail,
): StoryProjectExportPayload {
  return {
    storyProjectId: project.id,
    name: project.name,
    description: project.description,
    authoringMode: project.authoringMode,
    importedSystemPrompt: project.importedSystemPrompt,
    importedStoryState: project.importedStoryState,
    generatedSystemPrompt: project.generatedSystemPrompt,
    generatedStoryState: project.generatedStoryState,
    characters: project.characters.map((character) => ({
      id: character.id,
      entityId: character.entityId,
      name: character.name,
      role: character.role,
      isPlayer: character.isPlayer,
      identity: character.identity,
      background: character.background,
      appearance: character.appearance,
      behavioralProfile: character.behavioralProfile,
      startingDemeanor: character.startingDemeanor,
      importedMarkdown: character.importedMarkdown,
      provenance: character.provenance,
    })),
    relationships: project.relationships,
  };
}

export function buildConversationSnapshot(project: StoryProjectDetail) {
  return {
    title: project.name.trim() || "Story Chat",
    storyProjectId: project.id,
    messages: [] as [],
    systemPrompt: project.generatedSystemPrompt,
    storyState: project.generatedStoryState,
    previousStoryState: null,
    storyStateLastUpdated: null,
    settings: { ...DEFAULT_SETTINGS },
    systemPromptBaseline: project.generatedSystemPrompt,
    storyStateBaseline: project.generatedStoryState,
    lastIncludedAt: {},
    customSegments: project.generatedSegments ?? [],
    structuredState: project.generatedStructuredState,
    lastSummarizedTurn: 0,
    lastPipelineTurn: 0,
  };
}
