import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest } from "@/lib/api-logger";
import {
  getStoryProjectRow,
  regenerateStoryProject,
  toStoryCharacterRecord,
} from "@/lib/story-project-db";
import {
  createStoryCharacterEntityId,
  resolveProjectAuthoringModeFromSource,
} from "@/lib/story-project-core";
import type {
  CharacterProvenance,
  StoryProjectCharacterInput,
} from "@/lib/story-project-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeIdentity(input: StoryProjectCharacterInput) {
  const identity = input.identity;
  if (!identity) return null;

  const normalized = {
    age: normalizeText(identity.age) ?? "",
    role: normalizeText(identity.role) ?? "",
    situation: normalizeText(identity.situation) ?? "",
    pronouns:
      normalizeText(identity.pronouns === "custom" ? "" : identity.pronouns) ??
      "",
    species: normalizeText(identity.species) ?? "",
  };

  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function normalizeAppearance(input: StoryProjectCharacterInput) {
  const appearance = input.appearance;
  if (!appearance?.length) return null;

  const normalized = appearance
    .map((entry) => ({
      attribute: normalizeText(entry.attribute) ?? "",
      value: normalizeText(entry.value) ?? "",
    }))
    .filter((entry) => entry.attribute.length > 0 || entry.value.length > 0);

  return normalized.length > 0 ? normalized : null;
}

function normalizeBehavioralProfile(input: StoryProjectCharacterInput) {
  const profile = input.behavioralProfile;
  if (!profile) return null;

  const normalized = {
    overview: normalizeText(profile.overview) ?? "",
    speechPatterns: normalizeText(profile.speechPatterns) ?? "",
    vocabulary: normalizeText(profile.vocabulary) ?? "",
    emotionalTexture: normalizeText(profile.emotionalTexture) ?? "",
    withPlayer: normalizeText(profile.withPlayer) ?? "",
    commonMistakes: normalizeText(profile.commonMistakes) ?? "",
    mannerisms: normalizeText(profile.mannerisms) ?? "",
  };

  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function buildProvenance(
  input: StoryProjectCharacterInput,
): CharacterProvenance | null {
  const provenance: CharacterProvenance = {};

  if (normalizeIdentity(input)) provenance.identity = "form";
  if (normalizeText(input.background)) provenance.background = "form";
  if (normalizeAppearance(input)) provenance.appearance = "form";
  if (normalizeBehavioralProfile(input)) provenance.behavioralProfile = "form";
  if (normalizeText(input.startingDemeanor)) {
    provenance.startingDemeanor = "form";
  }

  return Object.keys(provenance).length > 0 ? provenance : null;
}

function buildCharacterData(input: StoryProjectCharacterInput, name: string) {
  const identity = normalizeIdentity(input);
  const appearance = normalizeAppearance(input);
  const behavioralProfile = normalizeBehavioralProfile(input);
  const provenance = buildProvenance(input);

  return {
    name,
    role: normalizeText(input.role) ?? "supporting",
    isPlayer: Boolean(input.isPlayer),
    identity:
      identity === null
        ? Prisma.DbNull
        : (identity as unknown as Prisma.InputJsonValue),
    background: normalizeText(input.background),
    appearance:
      appearance === null
        ? Prisma.DbNull
        : (appearance as unknown as Prisma.InputJsonValue),
    behavioralProfile:
      behavioralProfile === null
        ? Prisma.DbNull
        : (behavioralProfile as unknown as Prisma.InputJsonValue),
    startingDemeanor: normalizeText(input.startingDemeanor),
    importedMarkdown: normalizeText(input.importedMarkdown),
    provenance:
      provenance === null
        ? Prisma.DbNull
        : (provenance as unknown as Prisma.InputJsonValue),
  };
}

function hasStructuredCharacterData(
  input: StoryProjectCharacterInput,
): boolean {
  return Boolean(
    input.isPlayer ||
    normalizeIdentity(input) ||
    normalizeText(input.background) ||
    normalizeAppearance(input) ||
    normalizeBehavioralProfile(input) ||
    normalizeText(input.startingDemeanor),
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]/characters", { method: "GET", id });
  const userId = getUserId(request);
  const project = await getStoryProjectRow(prisma, userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project.characters.map(toStoryCharacterRecord));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as StoryProjectCharacterInput | null;
  logRequest("/api/story-projects/[id]/characters", {
    method: "POST",
    id,
    body,
  });
  const userId = getUserId(request);
  const name = body?.name?.trim();
  if (!body || !name) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const project = await getStoryProjectRow(tx, userId, id);
    if (!project) return null;
    if (
      body.isPlayer &&
      project.characters.some((character) => character.isPlayer)
    ) {
      return "player-conflict" as const;
    }

    const entityId =
      typeof body.entityId === "string" && UUID_RE.test(body.entityId)
        ? body.entityId
        : createStoryCharacterEntityId();

    const character = await tx.storyCharacter.create({
      data: {
        storyProjectId: id,
        entityId,
        ...buildCharacterData(body, name),
      },
    });
    const refreshed = await getStoryProjectRow(tx, userId, id);
    if (!refreshed) return null;
    const authoringMode = resolveProjectAuthoringModeFromSource({
      importedSystemPrompt: refreshed.importedSystemPrompt,
      importedStoryState: refreshed.importedStoryState,
      characters: refreshed.characters,
      hasStructuredEdits: hasStructuredCharacterData(body),
    });
    await regenerateStoryProject(tx, userId, id, authoringMode);
    return (
      refreshed.characters.find((item) => item.id === character.id) ?? null
    );
  });

  if (created === "player-conflict") {
    return NextResponse.json(
      { error: "Only one player character is allowed per story." },
      { status: 409 },
    );
  }
  if (!created) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryCharacterRecord(created));
}
