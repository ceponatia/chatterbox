import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest } from "@/lib/api-logger";
import {
  getStoryProjectRow,
  toStoryLocationRecord,
} from "@/lib/story-project-db";
import type { StoryLocationInput } from "@/lib/story-project-types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]/locations", { method: "GET", id });
  const userId = getUserId(request);
  const project = await getStoryProjectRow(prisma, userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project.locations.map(toStoryLocationRecord));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as StoryLocationInput | null;
  logRequest("/api/story-projects/[id]/locations", {
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

    const location = await tx.storyLocation.create({
      data: {
        storyProjectId: id,
        name,
        description: body.description?.trim() ?? "",
        tags: body.tags ?? [],
        atmosphere: body.atmosphere?.trim() ?? "",
        sortOrder: body.sortOrder ?? project.locations.length,
      },
    });

    const refreshed = await getStoryProjectRow(tx, userId, id);
    return refreshed?.locations.find((l) => l.id === location.id) ?? null;
  });

  if (!created) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryLocationRecord(created));
}
