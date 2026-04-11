/**
 * /api/state-update — HTTP boundary for the state pipeline.
 *
 * Converts UIMessage[] to SocketMessage[] at the SDK boundary, then
 * delegates to statePipelineAdapter which implements StatePipelineSocket.
 * Maps the socket result's `changes` field to `extractedFacts` for the
 * client-facing response shape.
 *
 * For story-project-linked conversations, resolves the effective state
 * (baseline + runtime) before feeding the pipeline-- the LLM sees the
 * merged view. The pipeline output is stored as-is (runtime only).
 */

import type { UIMessage } from "ai";
import { logRequest, logError, log } from "@/lib/api-logger";
import { statePipelineAdapter } from "@/lib/state-pipeline/pipeline-socket";
import type { SocketMessage, StatePipelineRequest } from "@chatterbox/sockets";
import { prisma } from "@/lib/prisma";
import {
  parseMarkdownToStructured,
  structuredToMarkdown,
  type StructuredStoryState,
} from "@chatterbox/state-model";
import { resolveEffectiveStateWithTiers } from "@/lib/effective-state-enhanced";

// ---------------------------------------------------------------------------
// UIMessage → SocketMessage boundary conversion
// ---------------------------------------------------------------------------

/**
 * Extract plain text content from a UIMessage (AI SDK v6 parts format).
 * Only user and assistant messages carry conversation content; system and
 * tool messages are dropped here since the pipeline prompt handles context.
 */
function toSocketMessages(messages: UIMessage[]): SocketMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content:
        m.parts
          ?.filter(
            (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
          )
          .map((p) => p.text)
          .join("") ?? "",
    }));
}

type AppStatePipelineRequest = StatePipelineRequest & { model?: string };

// ---------------------------------------------------------------------------
// Baseline lookup
// ---------------------------------------------------------------------------

async function loadBaselineState(
  conversationId: string | null | undefined,
): Promise<StructuredStoryState | null> {
  if (!conversationId) return null;
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { storyProjectId: true },
  });
  if (!conv?.storyProjectId) return null;
  const project = await prisma.storyProject.findUnique({
    where: { id: conv.storyProjectId },
    select: { generatedStructuredState: true },
  });
  return (
    (project?.generatedStructuredState as StructuredStoryState | null) ?? null
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      conversationId?: string | null;
      messages: UIMessage[];
      currentStoryState: string;
      turnNumber: number;
      lastPipelineTurn?: number;
      model?: string;
      staleSections?: string[];
      sinceMessageId?: string;
    };
    const lastPipelineTurn = body.lastPipelineTurn ?? 0;

    // When sinceMessageId is provided, only pass messages after that ID
    let messages = body.messages;
    if (body.sinceMessageId) {
      const idx = messages.findIndex((m) => m.id === body.sinceMessageId);
      if (idx >= 0) {
        messages = messages.slice(idx + 1);
      }
    }

    logRequest("/api/state-update", {
      conversationId: body.conversationId,
      turnNumber: body.turnNumber,
      totalMessages: messages.length,
      lastPipelineTurn,
      model: body.model,
      sinceMessageId: body.sinceMessageId ?? null,
    });

    // Resolve effective state for story-project-linked conversations.
    // The pipeline sees the merged view; its output is stored as runtime.
    const baseline = await loadBaselineState(body.conversationId);
    let pipelineInputState = body.currentStoryState;
    if (baseline) {
      const runtime = body.currentStoryState.trim()
        ? parseMarkdownToStructured(body.currentStoryState)
        : null;
      const effective = resolveEffectiveStateWithTiers({
        baseline,
        runtime,
      });
      pipelineInputState = structuredToMarkdown(effective);
      log(
        `  \x1b[2m\u{1f504} state-update: effective state resolved from baseline + runtime\x1b[0m`,
        "info",
      );
    }

    const result = await statePipelineAdapter.run({
      messages: toSocketMessages(messages),
      currentStoryState: pipelineInputState,
      turnNumber: body.turnNumber,
      lastPipelineTurn,
      model: body.model,
      staleSections: body.staleSections,
    } as AppStatePipelineRequest);

    // Map `changes` → `extractedFacts` for backward-compatible client API
    return Response.json({
      newState: result.newState,
      extractedFacts: result.changes,
      candidateFacts: result.candidateFacts ?? [],
      validation: result.validation,
      disposition: result.disposition,
      cascadeResets: result.cascadeResets,
      turnNumber: result.turnNumber,
    });
  } catch (error) {
    logError("State update API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
