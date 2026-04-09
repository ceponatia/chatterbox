import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest } from "@/lib/api-logger";
import { getStoryProjectDetail } from "@/lib/story-project-db";
import { buildStoryProjectExport } from "@/lib/story-project-core";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]/export", { method: "GET", id });
  const userId = getUserId(request);
  const project = await getStoryProjectDetail(prisma, userId, id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(buildStoryProjectExport(project));
}
