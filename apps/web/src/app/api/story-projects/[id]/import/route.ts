import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logError, logRequest } from "@/lib/api-logger";
import {
  createStoryCharacterEntityId,
  inferImportedCharacter,
  resolveProjectAuthoringModeFromSource,
} from "@/lib/story-project-core";
import {
  getStoryProjectRow,
  regenerateStoryProject,
} from "@/lib/story-project-db";
import { parseMarkdownToStructured } from "@chatterbox/state-model";
import type { StoryProjectImportInput } from "@/lib/story-project-types";

function hasImportPayload(body: StoryProjectImportInput | null): boolean {
  return Boolean(
    body &&
    (body.systemPromptMarkdown?.trim() ||
      body.storyStateMarkdown?.trim() ||
      (body.characters && body.characters.length > 0)),
  );
}

async function replaceImportedRelationships(
  tx: Prisma.TransactionClient,
  storyProjectId: string,
  storyStateMarkdown: string,
) {
  const structured = parseMarkdownToStructured(storyStateMarkdown);
  await tx.storyRelationship.deleteMany({ where: { storyProjectId } });
  if (structured.relationships.length === 0) return;

  await tx.storyRelationship.createMany({
    data: structured.relationships.map((relationship) => ({
      storyProjectId,
      fromEntityId: relationship.fromEntityId,
      toEntityId: relationship.toEntityId,
      description: relationship.description,
      details: relationship.details as unknown as Prisma.InputJsonValue,
      tone: relationship.tone ?? null,
    })),
  });
}

async function upsertImportedCharacters(
  tx: Prisma.TransactionClient,
  storyProjectId: string,
  existingCharacters: NonNullable<
    Awaited<ReturnType<typeof getStoryProjectRow>>
  >["characters"],
  inputCharacters: StoryProjectImportInput["characters"],
): Promise<"ok" | "invalid"> {
  if (!inputCharacters?.length) return "ok";

  const existingByName = new Map(
    existingCharacters.map((character) => [
      character.name.trim().toLowerCase(),
      character,
    ]),
  );
  const imports = inputCharacters
    .map(inferImportedCharacter)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (imports.length === 0) return "invalid";

  for (const item of imports) {
    const match = existingByName.get(item.name.trim().toLowerCase());
    if (match) {
      await tx.storyCharacter.update({
        where: { id: match.id },
        data: {
          name: item.name,
          role: item.role,
          importedMarkdown: item.markdown,
        },
      });
      continue;
    }

    await tx.storyCharacter.create({
      data: {
        storyProjectId,
        entityId: createStoryCharacterEntityId(),
        name: item.name,
        role: item.role,
        importedMarkdown: item.markdown,
      },
    });
  }

  return "ok";
}

function getImportedSourceUpdate(
  project: NonNullable<Awaited<ReturnType<typeof getStoryProjectRow>>>,
  body: StoryProjectImportInput,
) {
  const nextSystemPrompt = body.systemPromptMarkdown?.trim() || undefined;
  const nextStoryState = body.storyStateMarkdown?.trim() || undefined;
  if (nextSystemPrompt === undefined && nextStoryState === undefined)
    return null;

  return {
    importedSystemPrompt: nextSystemPrompt ?? project.importedSystemPrompt,
    importedStoryState: nextStoryState ?? project.importedStoryState,
    nextStoryState,
  };
}

async function applyImportedSourceUpdate(
  tx: Prisma.TransactionClient,
  storyProjectId: string,
  sourceUpdate: ReturnType<typeof getImportedSourceUpdate>,
) {
  if (!sourceUpdate) return;

  await tx.storyProject.update({
    where: { id: storyProjectId },
    data: {
      importedSystemPrompt: sourceUpdate.importedSystemPrompt,
      importedStoryState: sourceUpdate.importedStoryState,
    },
  });

  if (sourceUpdate.nextStoryState !== undefined) {
    await replaceImportedRelationships(
      tx,
      storyProjectId,
      sourceUpdate.nextStoryState,
    );
  }
}

async function regenerateImportedStoryProject(
  tx: Prisma.TransactionClient,
  userId: string,
  storyProjectId: string,
) {
  const refreshed = await getStoryProjectRow(tx, userId, storyProjectId);
  if (!refreshed) return null;

  const authoringMode = resolveProjectAuthoringModeFromSource({
    importedSystemPrompt: refreshed.importedSystemPrompt,
    importedStoryState: refreshed.importedStoryState,
    characters: refreshed.characters,
  });
  return regenerateStoryProject(tx, userId, storyProjectId, authoringMode);
}

async function importStoryProjectSource(
  tx: Prisma.TransactionClient,
  userId: string,
  storyProjectId: string,
  body: StoryProjectImportInput,
) {
  const project = await getStoryProjectRow(tx, userId, storyProjectId);
  if (!project) return null;

  const sourceUpdate = getImportedSourceUpdate(project, body);
  await applyImportedSourceUpdate(tx, storyProjectId, sourceUpdate);

  const characterResult = await upsertImportedCharacters(
    tx,
    storyProjectId,
    project.characters,
    body.characters,
  );
  if (characterResult === "invalid") return undefined;

  return regenerateImportedStoryProject(tx, userId, storyProjectId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as StoryProjectImportInput | null;
  logRequest("/api/story-projects/[id]/import", { method: "POST", id, body });
  const userId = getUserId(request);
  if (!hasImportPayload(body)) {
    return NextResponse.json({ error: "Nothing to import" }, { status: 400 });
  }
  const payload = body as StoryProjectImportInput;

  try {
    const imported = await prisma.$transaction((tx) =>
      importStoryProjectSource(tx, userId, id, payload),
    );

    if (imported === undefined) {
      return NextResponse.json(
        { error: "Character imports need a heading or name" },
        { status: 400 },
      );
    }
    if (!imported) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(imported);
  } catch (error) {
    logError("Story project import failed", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
