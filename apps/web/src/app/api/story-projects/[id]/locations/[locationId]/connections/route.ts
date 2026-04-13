import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest } from "@/lib/api-logger";
import {
  getStoryProjectRow,
  toStoryLocationRecord,
} from "@/lib/story-project-db";
import type { LocationConnectionInput } from "@/lib/story-project-types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const { id, locationId } = await params;
  logRequest(
    "/api/story-projects/[id]/locations/[locationId]/connections",
    { method: "GET", id, locationId },
  );
  const userId = getUserId(request);
  const project = await getStoryProjectRow(prisma, userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const location = project.locations.find((l) => l.id === locationId);
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryLocationRecord(location).connections);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  const { id, locationId } = await params;
  const body = (await request.json()) as {
    connections?: LocationConnectionInput[];
  } | null;
  logRequest(
    "/api/story-projects/[id]/locations/[locationId]/connections",
    { method: "PUT", id, locationId, body },
  );
  const userId = getUserId(request);
  const connections = body?.connections;
  if (!connections || !Array.isArray(connections)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const project = await getStoryProjectRow(tx, userId, id);
    if (!project) return null;
    if (!project.locations.some((l) => l.id === locationId))
      return "not-found" as const;

    // Validate that all toLocationId values reference locations in this project
    const projectLocationIds = new Set(project.locations.map((l) => l.id));
    for (const conn of connections) {
      if (!projectLocationIds.has(conn.toLocationId)) {
        return "invalid-target" as const;
      }
    }

    await tx.locationConnection.deleteMany({
      where: { fromLocationId: locationId },
    });

    if (connections.length > 0) {
      await tx.locationConnection.createMany({
        data: connections.map((conn) => ({
          fromLocationId: locationId,
          toLocationId: conn.toLocationId,
          description: conn.description ?? null,
          bidirectional: conn.bidirectional ?? true,
          traversalHint: conn.traversalHint ?? null,
        })),
      });
    }

    const refreshed = await getStoryProjectRow(tx, userId, id);
    return refreshed?.locations.find((l) => l.id === locationId) ?? null;
  });

  if (updated === "not-found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (updated === "invalid-target") {
    return NextResponse.json(
      { error: "Invalid target location" },
      { status: 400 },
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toStoryLocationRecord(updated).connections);
}
