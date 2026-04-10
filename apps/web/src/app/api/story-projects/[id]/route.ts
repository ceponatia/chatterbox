import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import {
  getStoryProjectDetail,
  regenerateStoryProject,
} from "@/lib/story-project-db";
import { logRequest } from "@/lib/api-logger";
import type { StoryProjectInput } from "@/lib/story-project-types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]", { method: "GET", id });
  const userId = getUserId(request);
  const project = await getStoryProjectDetail(prisma, userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as StoryProjectInput | null;
  logRequest("/api/story-projects/[id]", { method: "PUT", id, body });
  const userId = getUserId(request);
  const name = body?.name?.trim();
  if (!body || !name) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const project = await tx.storyProject.findFirst({ where: { id, userId } });
    if (!project) return null;
    await tx.storyProject.update({
      where: { id },
      data: {
        name,
        description: body.description?.trim() ?? "",
        ...(body.segmentOverrides !== undefined && {
          segmentOverrides:
            body.segmentOverrides as unknown as Prisma.InputJsonValue,
        }),
        ...(body.mainEntityId !== undefined && {
          mainEntityId: body.mainEntityId ?? null,
        }),
        ...(body.promptBlueprint !== undefined && {
          promptBlueprint:
            (body.promptBlueprint as unknown as Prisma.InputJsonValue) ?? null,
        }),
        ...(body.runtimeSeed !== undefined && {
          runtimeSeed:
            (body.runtimeSeed as unknown as Prisma.InputJsonValue) ?? null,
        }),
      },
    });
    return regenerateStoryProject(tx, userId, id);
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]", { method: "DELETE", id });
  const userId = getUserId(request);
  await prisma.storyProject.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
