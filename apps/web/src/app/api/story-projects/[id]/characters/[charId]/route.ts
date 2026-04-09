import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { logRequest } from "@/lib/api-logger";
import { getUserId } from "@/lib/get-user-id";
import { prisma } from "@/lib/prisma";
import { resolveProjectAuthoringModeFromSource } from "@/lib/story-project-core";
import {
  getStoryProjectRow,
  regenerateStoryProject,
  toStoryCharacterRecord,
} from "@/lib/story-project-db";
import type {
  CharacterAppearanceEntry,
  CharacterBehavioralProfile,
  CharacterIdentity,
  CharacterProvenance,
  StoryProjectCharacterInput,
} from "@/lib/story-project-types";

const IDENTITY_KEYS = ["age", "role", "situation", "pronouns", "species"] as const;
const PROFILE_KEYS = [
  "overview",
  "speechPatterns",
  "vocabulary",
  "emotionalTexture",
  "withPlayer",
  "commonMistakes",
  "mannerisms",
] as const;

type StoryProjectRow = NonNullable<Awaited<ReturnType<typeof getStoryProjectRow>>>;
type StoryCharacterRow = StoryProjectRow["characters"][number];
type PutResult = StoryCharacterRow | "player-conflict" | null;

interface NormalizedCharacterInput {
  name: string;
  role: string;
  isPlayer: boolean;
  importedMarkdown: string | null | undefined;
  identity: CharacterIdentity | null | undefined;
  background: string | null | undefined;
  appearance: CharacterAppearanceEntry[] | null | undefined;
  behavioralProfile: CharacterBehavioralProfile | null | undefined;
  startingDemeanor: string | null | undefined;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringRecord<T extends string>(
  keys: readonly T[],
  value: Partial<Record<T, string | null | undefined>> | null | undefined,
  transform?: (key: T, entry: string | null | undefined) => string | null | undefined,
): Record<T, string> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = keys.reduce<Record<T, string>>((result, key) => {
    const rawValue = transform ? transform(key, value[key]) : value[key];
    result[key] = normalizeText(rawValue) ?? "";
    return result;
  }, {} as Record<T, string>);

  return Object.values(normalized).every(
    (entry) => typeof entry === "string" && entry.length === 0,
  )
    ? null
    : normalized;
}

function normalizeIdentity(
  value: StoryProjectCharacterInput["identity"],
): CharacterIdentity | null | undefined {
  return normalizeStringRecord(IDENTITY_KEYS, value, (key, entry) =>
    key === "pronouns" && entry === "custom" ? "" : entry,
  ) as CharacterIdentity | null | undefined;
}

function normalizeAppearance(
  value: StoryProjectCharacterInput["appearance"],
): CharacterAppearanceEntry[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const appearance = value
    .map((entry) => ({
      attribute: normalizeText(entry.attribute) ?? "",
      value: normalizeText(entry.value) ?? "",
    }))
    .filter((entry) => entry.attribute.length > 0 || entry.value.length > 0);

  return appearance.length > 0 ? appearance : null;
}

function normalizeBehavioralProfile(
  value: StoryProjectCharacterInput["behavioralProfile"],
): CharacterBehavioralProfile | null | undefined {
  return normalizeStringRecord(PROFILE_KEYS, value) as
    | CharacterBehavioralProfile
    | null
    | undefined;
}

function normalizeCharacterInput(
  body: StoryProjectCharacterInput,
): NormalizedCharacterInput {
  return {
    name: body.name.trim(),
    role: body.role?.trim() || "supporting",
    isPlayer: Boolean(body.isPlayer),
    importedMarkdown:
      body.importedMarkdown !== undefined
        ? normalizeText(body.importedMarkdown)
        : undefined,
    identity: normalizeIdentity(body.identity),
    background:
      body.background !== undefined ? normalizeText(body.background) : undefined,
    appearance: normalizeAppearance(body.appearance),
    behavioralProfile: normalizeBehavioralProfile(body.behavioralProfile),
    startingDemeanor:
      body.startingDemeanor !== undefined
        ? normalizeText(body.startingDemeanor)
        : undefined,
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function withFormProvenance(
  provenance: CharacterProvenance | null | undefined,
  key: keyof CharacterProvenance,
): CharacterProvenance {
  return {
    ...(provenance ?? {}),
    [key]: "form",
  };
}

function applyTextUpdate(
  data: Prisma.StoryCharacterUpdateInput,
  field: "background" | "startingDemeanor",
  nextValue: string | null | undefined,
  currentValue: string | null,
  provenance: CharacterProvenance | null,
  provenanceKey: keyof CharacterProvenance,
): CharacterProvenance | null {
  if (nextValue === undefined || nextValue === currentValue) return provenance;
  data[field] = nextValue;
  return withFormProvenance(provenance, provenanceKey);
}

function applyJsonUpdate(
  data: Prisma.StoryCharacterUpdateInput,
  field: "identity" | "appearance" | "behavioralProfile",
  nextValue:
    | CharacterIdentity
    | CharacterAppearanceEntry[]
    | CharacterBehavioralProfile
    | null
    | undefined,
  currentValue: unknown,
  provenance: CharacterProvenance | null,
  provenanceKey: keyof CharacterProvenance,
): CharacterProvenance | null {
  if (nextValue === undefined || sameValue(nextValue, currentValue)) return provenance;
  data[field] = nextValue
    ? (nextValue as unknown as Prisma.InputJsonValue)
    : Prisma.DbNull;
  return withFormProvenance(provenance, provenanceKey);
}

function buildCharacterUpdateData(
  existing: StoryCharacterRow,
  input: NormalizedCharacterInput,
): Prisma.StoryCharacterUpdateInput {
  const data: Prisma.StoryCharacterUpdateInput = {
    name: input.name,
    role: input.role,
    isPlayer: input.isPlayer,
  };

  if (
    input.importedMarkdown !== undefined &&
    input.importedMarkdown !== existing.importedMarkdown
  ) {
    data.importedMarkdown = input.importedMarkdown;
  }

  let nextProvenance = (existing.provenance as CharacterProvenance | null) ?? null;
  nextProvenance = applyJsonUpdate(
    data,
    "identity",
    input.identity,
    existing.identity,
    nextProvenance,
    "identity",
  );
  nextProvenance = applyTextUpdate(
    data,
    "background",
    input.background,
    existing.background ?? null,
    nextProvenance,
    "background",
  );
  nextProvenance = applyJsonUpdate(
    data,
    "appearance",
    input.appearance,
    existing.appearance,
    nextProvenance,
    "appearance",
  );
  nextProvenance = applyJsonUpdate(
    data,
    "behavioralProfile",
    input.behavioralProfile,
    existing.behavioralProfile,
    nextProvenance,
    "behavioralProfile",
  );
  nextProvenance = applyTextUpdate(
    data,
    "startingDemeanor",
    input.startingDemeanor,
    existing.startingDemeanor ?? null,
    nextProvenance,
    "startingDemeanor",
  );

  if (!sameValue(nextProvenance, existing.provenance)) {
    data.provenance = nextProvenance
      ? (nextProvenance as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull;
  }

  return data;
}

function hasStructuredCharacterData(input: NormalizedCharacterInput): boolean {
  return Boolean(
    input.isPlayer ||
      input.identity ||
      input.background ||
      input.appearance ||
      input.behavioralProfile ||
      input.startingDemeanor,
  );
}

function findCharacter(project: StoryProjectRow | null, charId: string) {
  return project?.characters.find((item) => item.id === charId) ?? null;
}

async function updateCharacter(
  tx: Prisma.TransactionClient,
  userId: string,
  projectId: string,
  charId: string,
  input: NormalizedCharacterInput,
): Promise<PutResult> {
  const project = await getStoryProjectRow(tx, userId, projectId);
  const existing = findCharacter(project, charId);
  if (!project || !existing) return null;

  if (
    input.isPlayer &&
    project.characters.some(
      (character) => character.id !== charId && character.isPlayer,
    )
  ) {
    return "player-conflict";
  }

  await tx.storyCharacter.update({
    where: { id: charId },
    data: buildCharacterUpdateData(existing, input),
  });

  const refreshed = await getStoryProjectRow(tx, userId, projectId);
  if (!refreshed) return null;

  const authoringMode = resolveProjectAuthoringModeFromSource({
    importedSystemPrompt: refreshed.importedSystemPrompt,
    importedStoryState: refreshed.importedStoryState,
    characters: refreshed.characters,
    hasStructuredEdits: hasStructuredCharacterData(input),
  });
  await regenerateStoryProject(tx, userId, projectId, authoringMode);
  return findCharacter(refreshed, charId);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  const { id, charId } = await params;
  logRequest("/api/story-projects/[id]/characters/[charId]", {
    method: "GET",
    id,
    charId,
  });

  const userId = getUserId(request);
  const project = await getStoryProjectRow(prisma, userId, id);
  const character = findCharacter(project, charId);
  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryCharacterRecord(character));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  const { id, charId } = await params;
  const body = (await request.json()) as StoryProjectCharacterInput | null;
  logRequest("/api/story-projects/[id]/characters/[charId]", {
    method: "PUT",
    id,
    charId,
    body,
  });

  const userId = getUserId(request);
  const name = body?.name?.trim();
  if (!body || !name) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const input = normalizeCharacterInput(body);
  const updated = await prisma.$transaction((tx) =>
    updateCharacter(tx, userId, id, charId, input),
  );

  if (updated === "player-conflict") {
    return NextResponse.json(
      { error: "Only one player character is allowed per story." },
      { status: 409 },
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryCharacterRecord(updated));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  const { id, charId } = await params;
  logRequest("/api/story-projects/[id]/characters/[charId]", {
    method: "DELETE",
    id,
    charId,
  });

  const userId = getUserId(request);
  const deleted = await prisma.$transaction(async (tx) => {
    const project = await getStoryProjectRow(tx, userId, id);
    const existing = findCharacter(project, charId);
    if (!project || !existing) return false;

    await tx.storyCharacter.delete({ where: { id: charId } });

    const refreshed = await getStoryProjectRow(tx, userId, id);
    if (!refreshed) return false;

    const authoringMode = resolveProjectAuthoringModeFromSource({
      importedSystemPrompt: refreshed.importedSystemPrompt,
      importedStoryState: refreshed.importedStoryState,
      characters: refreshed.characters,
    });
    await regenerateStoryProject(tx, userId, id, authoringMode);
    return true;
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
