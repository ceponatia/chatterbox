import type { Prisma, PrismaClient } from "@prisma/client";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import type { StructuredStoryState } from "@chatterbox/state-model";
import { generateStoryProjectArtifacts } from "@/lib/story-project-core";
import type {
  CharacterAppearanceEntry,
  CharacterBehavioralProfile,
  CharacterIdentity,
  DialogueExample,
  PromptBlueprint,
  RuntimeSeed,
  StoryCharacterRecord,
  StoryLocationRecord,
  StoryProjectDetail,
  StoryProjectSummary,
  StoryRelationshipRecord,
} from "@/lib/story-project-types";
import type { SensoryProfile } from "@/lib/sensory-schema";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const storyProjectInclude = {
  characters: {
    orderBy: [{ createdAt: "asc" as const }],
  },
  relationships: {
    orderBy: [{ createdAt: "asc" as const }],
  },
  locations: {
    include: {
      connectionsFrom: {
        include: { toLocation: { select: { name: true } } },
      },
    },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
} satisfies Prisma.StoryProjectInclude;

type StoryProjectRow = Prisma.StoryProjectGetPayload<{
  include: typeof storyProjectInclude;
}>;

function asIdentity(value: Prisma.JsonValue | null): CharacterIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as unknown as CharacterIdentity;
}

function asAppearance(
  value: Prisma.JsonValue | null,
): CharacterAppearanceEntry[] | null {
  return Array.isArray(value)
    ? (value as unknown as CharacterAppearanceEntry[])
    : null;
}

function asBehavioralProfile(
  value: Prisma.JsonValue | null,
): CharacterBehavioralProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as unknown as CharacterBehavioralProfile;
}

function asSensoryProfile(
  value: Prisma.JsonValue | null,
): SensoryProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as unknown as SensoryProfile;
}

function asDialogueExamples(
  value: Prisma.JsonValue | null,
): DialogueExample[] | null {
  return Array.isArray(value) ? (value as unknown as DialogueExample[]) : null;
}

export function toStoryCharacterRecord(
  row: StoryProjectRow["characters"][number],
): StoryCharacterRecord {
  return {
    id: row.id,
    storyProjectId: row.storyProjectId,
    entityId: row.entityId,
    name: row.name,
    role: row.role,
    isPlayer: row.isPlayer,
    identity: asIdentity(row.identity as Prisma.JsonValue | null),
    background: row.background ?? null,
    appearance: asAppearance(row.appearance as Prisma.JsonValue | null),
    behavioralProfile: asBehavioralProfile(
      row.behavioralProfile as Prisma.JsonValue | null,
    ),
    sensoryProfile: asSensoryProfile(
      row.sensoryProfile as Prisma.JsonValue | null,
    ),
    defaultLocationId: row.defaultLocationId ?? null,
    dialogueExamples: asDialogueExamples(
      row.dialogueExamples as Prisma.JsonValue | null,
    ),
    startingDemeanor: row.startingDemeanor ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStoryLocationRecord(
  row: StoryProjectRow["locations"][number],
): StoryLocationRecord {
  return {
    id: row.id,
    storyProjectId: row.storyProjectId,
    name: row.name,
    description: row.description,
    tags: row.tags,
    atmosphere: row.atmosphere,
    sortOrder: row.sortOrder,
    connections: row.connectionsFrom.map((conn) => ({
      id: conn.id,
      fromLocationId: conn.fromLocationId,
      toLocationId: conn.toLocationId,
      toLocationName: conn.toLocation.name,
      description: conn.description,
      bidirectional: conn.bidirectional,
      traversalHint: conn.traversalHint,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStoryRelationshipRecord(
  row: StoryProjectRow["relationships"][number],
): StoryRelationshipRecord {
  return {
    id: row.id,
    storyProjectId: row.storyProjectId,
    fromEntityId: row.fromEntityId,
    toEntityId: row.toEntityId,
    description: row.description,
    details: (row.details as string[] | null) ?? [],
    tone: (row.tone as StoryRelationshipRecord["tone"]) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStoryProjectSummary(
  row: StoryProjectRow,
): StoryProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    characterCount: row.characters.length,
    relationshipCount: row.relationships.length,
    locationCount: row.locations.length,
  };
}

export function toStoryProjectDetail(row: StoryProjectRow): StoryProjectDetail {
  return {
    ...toStoryProjectSummary(row),
    generatedSystemPrompt: row.generatedSystemPrompt,
    generatedStoryState: row.generatedStoryState,
    generatedSegments:
      (row.generatedSegments as SerializedSegment[] | null) ?? null,
    generatedStructuredState:
      (row.generatedStructuredState as StructuredStoryState | null) ?? null,
    mainEntityId: row.mainEntityId ?? null,
    promptBlueprint: (row.promptBlueprint as PromptBlueprint | null) ?? null,
    runtimeSeed: (row.runtimeSeed as RuntimeSeed | null) ?? null,
    characters: row.characters.map(toStoryCharacterRecord),
    relationships: row.relationships.map(toStoryRelationshipRecord),
    locations: row.locations.map(toStoryLocationRecord),
  };
}

export async function getStoryProjectRow(
  db: DatabaseClient,
  userId: string,
  id: string,
): Promise<StoryProjectRow | null> {
  return db.storyProject.findFirst({
    where: { id, userId },
    include: storyProjectInclude,
  });
}

export async function getStoryProjectDetail(
  db: DatabaseClient,
  userId: string,
  id: string,
): Promise<StoryProjectDetail | null> {
  const row = await getStoryProjectRow(db, userId, id);
  return row ? toStoryProjectDetail(row) : null;
}

export async function listStoryProjectSummaries(
  db: DatabaseClient,
  userId: string,
): Promise<StoryProjectSummary[]> {
  const rows = await db.storyProject.findMany({
    where: { userId },
    include: storyProjectInclude,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toStoryProjectSummary);
}

export async function regenerateStoryProject(
  db: DatabaseClient,
  userId: string,
  id: string,
): Promise<StoryProjectDetail | null> {
  const row = await getStoryProjectRow(db, userId, id);
  if (!row) return null;

  const artifacts = generateStoryProjectArtifacts({
    importedStoryState: row.importedStoryState,
    characters: row.characters.map(toStoryCharacterRecord),
    relationships: row.relationships.map(toStoryRelationshipRecord),
    locations: row.locations.map(toStoryLocationRecord),
    promptBlueprint: (row.promptBlueprint as PromptBlueprint | null) ?? null,
    runtimeSeed: (row.runtimeSeed as RuntimeSeed | null) ?? null,
  });

  const updated = await db.storyProject.update({
    where: { id: row.id },
    data: {
      generatedSystemPrompt: artifacts.generatedSystemPrompt,
      generatedStoryState: artifacts.generatedStoryState,
      generatedSegments:
        artifacts.generatedSegments as unknown as Prisma.InputJsonValue,
      generatedStructuredState:
        artifacts.generatedStructuredState as unknown as Prisma.InputJsonValue,
    },
    include: storyProjectInclude,
  });

  return toStoryProjectDetail(updated);
}
