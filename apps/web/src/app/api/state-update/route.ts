/**
 * /api/state-update — HTTP boundary for the state pipeline.
 *
 * Converts UIMessage[] to SocketMessage[] at the SDK boundary, then
 * delegates to statePipelineAdapter which implements StatePipelineSocket.
 * Maps the socket result's `changes` field to `extractedFacts` for the
 * client-facing response shape.
 */

import type { UIMessage } from "ai";
import { logRequest, logError } from "@/lib/api-logger";
import { statePipelineAdapter } from "@/lib/state-pipeline/pipeline-socket";
import type { SocketMessage, StatePipelineRequest } from "@chatterbox/sockets";

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
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages: UIMessage[];
      currentStoryState: string;
      turnNumber: number;
      lastPipelineTurn?: number;
      model?: string;
    };
    const lastPipelineTurn = body.lastPipelineTurn ?? 0;

    logRequest("/api/state-update", {
      turnNumber: body.turnNumber,
      totalMessages: body.messages.length,
      lastPipelineTurn,
      model: body.model,
    });

    const result = await statePipelineAdapter.run({
      messages: toSocketMessages(body.messages),
      currentStoryState: body.currentStoryState,
      turnNumber: body.turnNumber,
      lastPipelineTurn,
      model: body.model,
    } as AppStatePipelineRequest);

    // Map `changes` → `extractedFacts` for backward-compatible client API
    return Response.json({
      newState: result.newState,
      extractedFacts: result.changes,
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
