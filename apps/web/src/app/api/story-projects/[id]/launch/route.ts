import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logError, logRequest } from "@/lib/api-logger";
import {
  buildConversationSnapshot,
  resolveProjectAuthoringModeFromSource,
} from "@/lib/story-project-core";
import {
  getStoryProjectDetail,
  getStoryProjectRow,
  regenerateStoryProject,
} from "@/lib/story-project-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  logRequest("/api/story-projects/[id]/launch", { method: "POST", id });
  const userId = getUserId(request);

  try {
    const launched = await prisma.$transaction(async (tx) => {
      const projectRow = await getStoryProjectRow(tx, userId, id);
      if (!projectRow) return null;

      let project = await getStoryProjectDetail(tx, userId, id);
      const needsGeneration =
        !project?.generatedSystemPrompt.trim() ||
        !project.generatedStoryState.trim() ||
        !project.generatedSegments ||
        !project.generatedStructuredState;

      if (!project || needsGeneration) {
        const authoringMode = resolveProjectAuthoringModeFromSource({
          importedSystemPrompt: projectRow.importedSystemPrompt,
          importedStoryState: projectRow.importedStoryState,
          characters: projectRow.characters,
        });
        project = await regenerateStoryProject(tx, userId, id, authoringMode);
      }
      if (!project) return null;

      const snapshot = buildConversationSnapshot(project);
      const conversation = await tx.conversation.create({
        data: {
          userId,
          storyProjectId: project.id,
          title: snapshot.title,
          messages: snapshot.messages as unknown as Prisma.InputJsonValue,
          systemPrompt: snapshot.systemPrompt,
          storyState: snapshot.storyState,
          previousStoryState: snapshot.previousStoryState,
          storyStateLastUpdated: snapshot.storyStateLastUpdated,
          settings: snapshot.settings as unknown as Prisma.InputJsonValue,
          systemPromptBaseline: snapshot.systemPromptBaseline,
          storyStateBaseline: snapshot.storyStateBaseline,
          lastIncludedAt:
            snapshot.lastIncludedAt as unknown as Prisma.InputJsonValue,
          customSegments:
            snapshot.customSegments as unknown as Prisma.InputJsonValue,
          structuredState:
            snapshot.structuredState as unknown as Prisma.InputJsonValue,
          lastSummarizedTurn: snapshot.lastSummarizedTurn,
          lastPipelineTurn: snapshot.lastPipelineTurn,
        },
        select: { id: true },
      });

      return {
        conversationId: conversation.id,
        storyProjectId: project.id,
      };
    });

    if (!launched) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(launched);
  } catch (error) {
    logError("Story project launch failed", error);
    return NextResponse.json({ error: "Launch failed" }, { status: 500 });
  }
}
