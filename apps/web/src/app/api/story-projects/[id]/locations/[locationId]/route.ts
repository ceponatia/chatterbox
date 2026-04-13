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
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const { id, locationId } = await params;
  logRequest("/api/story-projects/[id]/locations/[locationId]", {
    method: "GET",
    id,
    locationId,
  });
  const userId = getUserId(request);
  const project = await getStoryProjectRow(prisma, userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const location = project.locations.find((l) => l.id === locationId);
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryLocationRecord(location));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const { id, locationId } = await params;
  const body = (await request.json()) as StoryLocationInput | null;
  logRequest("/api/story-projects/[id]/locations/[locationId]", {
    method: "PUT",
    id,
    locationId,
    body,
  });
  const userId = getUserId(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const project = await getStoryProjectRow(tx, userId, id);
    if (!project) return null;
    if (!project.locations.some((l) => l.id === locationId))
      return "not-found" as const;

    await tx.storyLocation.update({
      where: { id: locationId },
      data: {
        name: body.name?.trim(),
        description: body.description?.trim(),
        tags: body.tags,
        atmosphere: body.atmosphere?.trim(),
        sortOrder: body.sortOrder,
      },
    });

    const refreshed = await getStoryProjectRow(tx, userId, id);
    return refreshed?.locations.find((l) => l.id === locationId) ?? null;
  });

  if (updated === "not-found" || !updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryLocationRecord(updated));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const { id, locationId } = await params;
  logRequest("/api/story-projects/[id]/locations/[locationId]", {
    method: "DELETE",
    id,
    locationId,
  });
  const userId = getUserId(request);

  const result = await prisma.$transaction(async (tx) => {
    const project = await getStoryProjectRow(tx, userId, id);
    if (!project) return null;
    if (!project.locations.some((l) => l.id === locationId))
      return "not-found" as const;

    await tx.storyLocation.delete({ where: { id: locationId } });
    return "ok" as const;
  });

  if (result === "not-found" || !result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
