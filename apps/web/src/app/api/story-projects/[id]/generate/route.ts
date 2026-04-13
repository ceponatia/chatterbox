import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logError, logRequest } from "@/lib/api-logger";
import { regenerateStoryProject } from "@/lib/story-project-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]/generate", { method: "POST", id });
  const userId = getUserId(request);

  try {
    const generated = await prisma.$transaction(async (tx) => {
      return regenerateStoryProject(tx, userId, id);
    });

    if (!generated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(generated);
  } catch (error) {
    logError("Story project generation failed", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
