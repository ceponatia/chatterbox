import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest } from "@/lib/api-logger";
import {
  getStoryProjectRow,
  regenerateStoryProject,
} from "@/lib/story-project-db";
import { resolveProjectAuthoringModeFromSource } from "@/lib/story-project-core";
import type {
  StoryProjectRelationshipInput,
  StoryRelationshipRecord,
} from "@/lib/story-project-types";

function toRecord(row: {
  id: string;
  storyProjectId: string;
  fromEntityId: string;
  toEntityId: string;
  description: string;
  details: unknown;
  tone: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StoryRelationshipRecord {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]/relationships", { method: "GET", id });
  const userId = getUserId(request);
  const project = await getStoryProjectRow(prisma, userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project.relationships.map(toRecord));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    relationships?: StoryProjectRelationshipInput[];
  } | null;
  logRequest("/api/story-projects/[id]/relationships", {
    method: "PUT",
    id,
    body,
  });
  const userId = getUserId(request);
  const relationships = body?.relationships;
  if (!relationships || !Array.isArray(relationships)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const project = await getStoryProjectRow(tx, userId, id);
    if (!project) return null;

    await tx.storyRelationship.deleteMany({ where: { storyProjectId: id } });
    if (relationships.length > 0) {
      await tx.storyRelationship.createMany({
        data: relationships.map((relationship) => ({
          storyProjectId: id,
          fromEntityId: relationship.fromEntityId,
          toEntityId: relationship.toEntityId,
          description: relationship.description,
          details: (relationship.details ??
            []) as unknown as Prisma.InputJsonValue,
          tone: relationship.tone ?? null,
        })),
      });
    }

    const refreshed = await getStoryProjectRow(tx, userId, id);
    if (!refreshed) return null;
    const authoringMode = resolveProjectAuthoringModeFromSource({
      importedSystemPrompt: refreshed.importedSystemPrompt,
      importedStoryState: refreshed.importedStoryState,
      characters: refreshed.characters,
      hasStructuredEdits: relationships.length > 0,
    });
    await regenerateStoryProject(tx, userId, id, authoringMode);
    const nextProject = await getStoryProjectRow(tx, userId, id);
    return nextProject?.relationships.map(toRecord) ?? null;
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
