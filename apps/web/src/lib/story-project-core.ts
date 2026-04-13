import {
  estimateTokens,
  parseSystemPromptToSegments,
  segmentsToMarkdown,
  type SerializedSegment,
} from "@chatterbox/prompt-assembly";
import {
  deriveBehaviorSegment,
  deriveAppearanceEntries,
  deriveDemeanorEntry,
  deriveEntity,
} from "@/lib/character-derivation";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
  type Settings,
} from "@/lib/defaults";
import {
  emptyStructuredState,
  parseMarkdownToStructured,
  remapEntityIds,
  structuredToMarkdown,
  type CustomSection,
  type HardFact,
  type LocationConnectionInfo,
  type LocationInfo,
  type StoryThread,
  type StructuredStoryState,
} from "@chatterbox/state-model";
import type {
  PromptBlueprint,
  RuntimeSeed,
  StoryCharacterRecord,
  StoryLocationRecord,
  StoryProjectArtifacts,
  StoryProjectDetail,
  StoryProjectExportPayload,
  StoryRelationshipRecord,
} from "@/lib/story-project-types";
import { generateId } from "@/lib/storage";

interface StoryProjectGenerationSource {
  importedStoryState: string | null;
  characters: StoryCharacterRecord[];
  relationships: StoryRelationshipRecord[];
  locations: StoryLocationRecord[];
  promptBlueprint: PromptBlueprint | null;
  runtimeSeed: RuntimeSeed | null;
}

export function createStoryCharacterEntityId(): string {
  return generateId();
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

/** Deterministic ID matching the state-model parser's internal scheme. */
function generateLocationId(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `loc-${normalized || Date.now().toString()}`;
}

function applyLocationsToState(
  state: StructuredStoryState,
  locations: StoryLocationRecord[],
  characters: StoryCharacterRecord[],
): StructuredStoryState {
  if (locations.length === 0) return state;

  const locationInfos: LocationInfo[] = locations.map((loc) => ({
    id: generateLocationId(loc.name),
    name: loc.name,
    description: loc.description || "",
    tags: loc.tags ?? [],
    atmosphere: loc.atmosphere || "",
    connectedTo: (loc.connections ?? []).map(
      (conn): LocationConnectionInfo => ({
        locationId: generateLocationId(conn.toLocationName),
        locationName: conn.toLocationName,
        description: conn.description || "",
        traversalHint: conn.traversalHint || "",
      }),
    ),
  }));

  const scene = { ...state.scene };
  if (!scene.locationId && locationInfos.length > 0) {
    const first = locationInfos[0];
    if (first) {
      scene.locationId = first.id;
      scene.location = first.name;
    }
  }

  const charByEntityId = new Map(
    characters.map((c) => [c.entityId, c]),
  );
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const entities = state.entities.map((entity) => {
    const char = charByEntityId.get(entity.id);
    if (!char?.defaultLocationId) return entity;
    const locRecord = locationById.get(char.defaultLocationId);
    if (!locRecord) return entity;
    return { ...entity, locationId: generateLocationId(locRecord.name) };
  });

  return { ...state, locations: locationInfos, scene, entities };
}

function applyRuntimeSeedToState(
  state: StructuredStoryState,
  seed: RuntimeSeed | null,
): StructuredStoryState {
  if (!seed) return state;

  let next = { ...state };

  if (seed.openingScene.trim()) {
    next = {
      ...next,
      scene: { ...next.scene, atmosphere: seed.openingScene.trim() },
    };
  }

  if (seed.openThreads.length > 0) {
    const threads: StoryThread[] = seed.openThreads
      .filter((t) => t.trim())
      .map((description) => ({
        id: generateId(),
        description,
        resolutionHint: "",
        status: "active" as const,
      }));
    if (threads.length > 0) {
      next = { ...next, openThreads: [...next.openThreads, ...threads] };
    }
  }

  if (seed.hardFacts.length > 0) {
    const facts: HardFact[] = seed.hardFacts
      .filter((f) => f.trim())
      .map((fact) => ({
        fact,
        superseded: false,
      }));
    if (facts.length > 0) {
      next = { ...next, hardFacts: [...next.hardFacts, ...facts] };
    }
  }

  if (seed.customState.trim()) {
    const customSection: CustomSection = {
      heading: "Initial State",
      content: seed.customState.trim(),
    };
    next = { ...next, custom: [...next.custom, customSection] };
  }

  return next;
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
  const withRelationships = applyRelationshipsToState(
    withCharacters,
    source.relationships,
  );
  const withLocations = applyLocationsToState(
    withRelationships,
    source.locations,
    source.characters,
  );
  return applyRuntimeSeedToState(withLocations, source.runtimeSeed);
}

function upsertCharacterSegments(
  segments: SerializedSegment[],
  characters: StoryCharacterRecord[],
): SerializedSegment[] {
  let next = [...segments];
  for (const character of characters) {
    const segment = deriveBehaviorSegment(character);
    if (!segment) continue;
    next = upsertSegment(next, segment);
  }
  return next;
}

function buildBlueprintSegments(
  blueprint: PromptBlueprint,
): SerializedSegment[] {
  const segments: SerializedSegment[] = [];
  let order = 10;

  if (blueprint.setting.trim()) {
    segments.push({
      id: "setting_premise",
      label: "Setting",
      content: blueprint.setting,
      policy: { type: "always" },
      priority: "high",
      order: order++,
      category: "world",
      tokenEstimate: Math.ceil(blueprint.setting.length / 4),
    });
  }

  if (blueprint.themes.trim()) {
    segments.push({
      id: "story_themes",
      label: "Themes",
      content: blueprint.themes,
      policy: { type: "always" },
      priority: "high",
      order: order++,
      category: "world",
      tokenEstimate: Math.ceil(blueprint.themes.length / 4),
    });
  }

  if (blueprint.coreRules.trim()) {
    segments.push({
      id: "core_rules",
      label: "Core Rules",
      content: blueprint.coreRules,
      policy: { type: "always" },
      priority: "critical",
      order: order++,
      category: "rules",
      tokenEstimate: Math.ceil(blueprint.coreRules.length / 4),
    });
  }

  if (blueprint.outputFormat.trim()) {
    segments.push({
      id: "output_format",
      label: "Output Format",
      content: blueprint.outputFormat,
      policy: { type: "always" },
      priority: "high",
      order: order++,
      category: "rules",
      tokenEstimate: Math.ceil(blueprint.outputFormat.length / 4),
    });
  }

  if (blueprint.npcFraming.trim()) {
    segments.push({
      id: "npc_framing",
      label: "NPC Framing",
      content: blueprint.npcFraming,
      policy: { type: "always" },
      priority: "high",
      order: order++,
      category: "character",
      tokenEstimate: Math.ceil(blueprint.npcFraming.length / 4),
    });
  }

  if (blueprint.narrationGuidelines.trim()) {
    segments.push({
      id: "narration_guidelines",
      label: "Narration Guidelines",
      content: blueprint.narrationGuidelines,
      policy: { type: "every_n", n: 3 },
      priority: "normal",
      order: order++,
      category: "rules",
      tokenEstimate: Math.ceil(blueprint.narrationGuidelines.length / 4),
    });
  }

  if (blueprint.interactionGuidelines.trim()) {
    segments.push({
      id: "interaction_guide",
      label: "Interaction Guidelines",
      content: blueprint.interactionGuidelines,
      policy: { type: "every_n", n: 3 },
      priority: "normal",
      order: order++,
      category: "rules",
      tokenEstimate: Math.ceil(blueprint.interactionGuidelines.length / 4),
    });
  }

  for (const section of blueprint.customSections) {
    if (!section.content.trim()) continue;
    segments.push({
      id: section.id,
      label: section.label || section.id,
      content: section.content,
      policy: { type: "always" },
      priority: "normal",
      order: order++,
      category: "custom",
      tokenEstimate: Math.ceil(section.content.length / 4),
    });
  }

  return segments;
}

function deriveLocationContextSegment(
  locations: readonly LocationInfo[],
): SerializedSegment | null {
  if (locations.length === 0) return null;

  const totalConnections = locations.reduce(
    (sum, loc) => sum + loc.connectedTo.length,
    0,
  );

  let content =
    `## Location System\n\n` +
    `This story has ${locations.length} authored locations connected by ${totalConnections} traversable paths.\n\n` +
    `### Rules\n` +
    `- Location descriptions are canonical. Do not contradict or embellish the stored description of a location.\n` +
    `- Characters move through connected paths. Do not teleport characters between unconnected locations.\n` +
    `- When {{ user }} indicates movement to a location, call move_to_location to execute the transition before narrating the arrival.\n` +
    `- After moving, use the returned description and atmosphere to set the scene. Do not re-describe on subsequent turns at the same location unless narratively warranted.\n` +
    `- Presence is derived from location. Only narrate characters as present if they are at the current location. Use get_location_details to verify.\n` +
    `- When uncertain about surroundings or what is nearby, use get_location_details or get_nearby_locations before narrating spatial details.\n\n` +
    `### Available Locations\n`;

  for (const loc of locations) {
    const tagSuffix = loc.tags.length > 0 ? ` (${loc.tags.join(", ")})` : "";
    content += `- ${loc.name}${tagSuffix}\n`;
  }

  return {
    id: "location_context",
    label: "Location System Context",
    content: content.trim(),
    policy: { type: "always" },
    priority: "high",
    order: 20,
    category: "world",
    omittedSummary: "Location system rules and spatial awareness guide",
    tokenEstimate: Math.ceil(content.length / 4),
  };
}

export function generateStoryProjectArtifacts(
  source: StoryProjectGenerationSource,
): StoryProjectArtifacts {
  let baseSegments: SerializedSegment[];

  if (source.promptBlueprint) {
    baseSegments = buildBlueprintSegments(source.promptBlueprint);
  } else {
    baseSegments = parseSystemPromptToSegments(DEFAULT_SYSTEM_PROMPT);
  }

  const characterSegments = upsertCharacterSegments(
    baseSegments,
    source.characters,
  );
  const generatedSegments = upsertPlayerIdentitySegment(
    characterSegments,
    source.characters,
  );
  const generatedStructuredState = buildGeneratedStructuredState(source);

  const locationSegment = deriveLocationContextSegment(
    generatedStructuredState.locations,
  );
  const finalSegments = locationSegment
    ? upsertSegment(generatedSegments, locationSegment)
    : generatedSegments;

  return {
    generatedSegments: finalSegments,
    generatedSystemPrompt: segmentsToMarkdown(finalSegments),
    generatedStructuredState,
    generatedStoryState: structuredToMarkdown(generatedStructuredState),
  };
}

export function buildStoryProjectExport(
  project: StoryProjectDetail,
): StoryProjectExportPayload {
  return {
    storyProjectId: project.id,
    name: project.name,
    description: project.description,
    generatedSystemPrompt: project.generatedSystemPrompt,
    generatedStoryState: project.generatedStoryState,
    mainEntityId: project.mainEntityId,
    promptBlueprint: project.promptBlueprint,
    runtimeSeed: project.runtimeSeed,
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
      sensoryProfile: character.sensoryProfile,
      dialogueExamples: character.dialogueExamples,
      startingDemeanor: character.startingDemeanor,
    })),
    relationships: project.relationships,
  };
}

export function buildConversationSnapshot(
  project: StoryProjectDetail,
  defaultSettings?: Settings,
) {
  return {
    title: project.name.trim() || "Story Chat",
    storyProjectId: project.id,
    messages: [] as [],
    systemPrompt: project.generatedSystemPrompt,
    storyState: project.generatedStoryState,
    previousStoryState: null,
    storyStateLastUpdated: null,
    settings: { ...(defaultSettings ?? DEFAULT_SETTINGS) },
    systemPromptBaseline: project.generatedSystemPrompt,
    storyStateBaseline: project.generatedStoryState,
    lastIncludedAt: {},
    customSegments: project.generatedSegments ?? [],
    structuredState: project.generatedStructuredState,
    lastPipelineTurn: 0,
  };
}
