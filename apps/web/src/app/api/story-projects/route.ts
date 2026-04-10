import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import {
  getStoryProjectDetail,
  getStoryProjectRow,
  listStoryProjectSummaries,
  regenerateStoryProject,
} from "@/lib/story-project-db";
import { logRequest } from "@/lib/api-logger";
import type {
  StoryProjectDuplicateInput,
  StoryProjectInput,
} from "@/lib/story-project-types";

function isDuplicateInput(
  body: StoryProjectInput | StoryProjectDuplicateInput,
): body is StoryProjectDuplicateInput {
  return "duplicateFromId" in body;
}

function optionalJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : (value as Prisma.InputJsonValue);
}

export async function GET(request: Request) {
  logRequest("/api/story-projects", { method: "GET" });
  const userId = getUserId(request);
  return NextResponse.json(await listStoryProjectSummaries(prisma, userId));
}

export async function POST(request: Request) {
  const body = (await request.json()) as
    | StoryProjectInput
    | StoryProjectDuplicateInput
    | null;
  logRequest("/api/story-projects", { method: "POST", body });
  const userId = getUserId(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (isDuplicateInput(body)) {
    const duplicate = await prisma.$transaction(async (tx) => {
      const source = await getStoryProjectRow(tx, userId, body.duplicateFromId);
      if (!source) return null;

      const created = await tx.storyProject.create({
        data: {
          userId,
          name: body.name?.trim() || `${source.name} Copy`,
          description: source.description,
          authoringMode: source.authoringMode,
          importedSystemPrompt: source.importedSystemPrompt,
          importedStoryState: source.importedStoryState,
          generatedSystemPrompt: source.generatedSystemPrompt,
          generatedStoryState: source.generatedStoryState,
          generatedSegments: source.generatedSegments ?? undefined,
          generatedStructuredState:
            source.generatedStructuredState ?? undefined,
          segmentOverrides: source.segmentOverrides ?? undefined,
          mainEntityId: source.mainEntityId,
          promptBlueprint: source.promptBlueprint ?? undefined,
          runtimeSeed: source.runtimeSeed ?? undefined,
        },
      });

      if (source.characters.length > 0) {
        await tx.storyCharacter.createMany({
          data: source.characters.map((character) => ({
            storyProjectId: created.id,
            entityId: character.entityId,
            name: character.name,
            role: character.role,
            isPlayer: character.isPlayer,
            identity: optionalJson(character.identity),
            background: character.background,
            appearance: optionalJson(character.appearance),
            behavioralProfile: optionalJson(character.behavioralProfile),
            dialogueExamples: optionalJson(character.dialogueExamples),
            startingDemeanor: character.startingDemeanor,
            importedMarkdown: character.importedMarkdown,
            provenance: optionalJson(character.provenance),
          })),
        });
      }

      if (source.relationships.length > 0) {
        await tx.storyRelationship.createMany({
          data: source.relationships.map((relationship) => ({
            storyProjectId: created.id,
            fromEntityId: relationship.fromEntityId,
            toEntityId: relationship.toEntityId,
            description: relationship.description,
            details: relationship.details as unknown as Prisma.InputJsonValue,
            tone: relationship.tone,
          })),
        });
      }

      return getStoryProjectDetail(tx, userId, created.id);
    });

    if (!duplicate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(duplicate);
  }

  const name = body.name?.trim() || "Untitled Story";
  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.storyProject.create({
      data: {
        userId,
        name,
        description: body.description?.trim() ?? "",
        authoringMode: "form",
      },
    });
    return regenerateStoryProject(tx, userId, project.id, "form");
  });

  if (!created) {
    return NextResponse.json(
      { error: "Failed to create story project" },
      { status: 500 },
    );
  }
  return NextResponse.json(created);
}
