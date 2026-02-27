import { generateText, type UIMessage } from "ai";
import {
  logRequest,
  logError,
  logResponse,
  logWarn,
  startTimer,
} from "@/lib/api-logger";
import { openrouter } from "@/lib/openrouter";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";
import { determineDisposition } from "@/lib/state-pipeline/auto-accept";
import { computeCascadeResets } from "@/lib/state-pipeline/cascade-triggers";
import { validateState } from "@/lib/state-pipeline/validation";
import type { ExtractedFact } from "@/lib/state-history";
import { prisma } from "@/lib/prisma";

interface RollbackResult {
  updatedState: string;
  changes: ExtractedFact[];
}

interface EvaluatedRollbackResult {
  updatedState: string;
  changes: ExtractedFact[];
  validation: ReturnType<typeof validateState>;
  disposition: ReturnType<typeof determineDisposition>;
}

interface RollbackRequestBody {
  deletedMessages: UIMessage[];
  remainingMessages: UIMessage[];
  currentStoryState: string;
  conversationId?: string;
  turnNumber: number;
  model?: string;
}

async function pruneEmbeddingsForRollback(
  conversationId: string | undefined,
  turnNumber: number,
): Promise<void> {
  if (!conversationId) return;

  const lastRemainingTurnIndex = turnNumber - 1;
  await prisma.$queryRawUnsafe(
    `DELETE FROM "MessageEmbedding" WHERE "conversationId" = $1 AND "turnIndex" > $2`,
    conversationId,
    lastRemainingTurnIndex,
  );
}

const PASS_VALIDATION = {
  schemaValid: true,
  allHardFactsPreserved: true,
  noUnknownFacts: true,
  outputComplete: true,
  diffPercentage: 0,
} as const;

function messageText(message: UIMessage): string {
  return (
    message.parts
      ?.filter(
        (part): part is Extract<typeof part, { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("") ?? ""
  );
}

function formatMessagesForPrompt(messages: UIMessage[]): string {
  return messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .map((message, index) => {
      const text = messageText(message).trim() || "(empty)";
      return `${index + 1}. [${message.role}] ${text}`;
    })
    .join("\n");
}

function buildRetryFeedback(validation: {
  schemaValid: boolean;
  outputComplete: boolean;
  noUnknownFacts: boolean;
  diffPercentage: number;
}): string {
  const failures: string[] = [];
  if (!validation.schemaValid) {
    failures.push("Your output missed one or more required sections.");
  }
  if (!validation.outputComplete) {
    failures.push("Your output appears truncated or incomplete.");
  }
  if (!validation.noUnknownFacts) {
    failures.push(
      "You introduced facts that were not grounded in the provided messages.",
    );
  }
  if (validation.diffPercentage > 50) {
    failures.push(
      `Your update changed too much of the state (${validation.diffPercentage}%).`,
    );
  }
  if (failures.length === 0) return "";
  return `\n\nRetry feedback:\n${failures.map((failure) => `- ${failure}`).join("\n")}`;
}

async function runRollback(
  model: string,
  providerOrder: readonly string[],
  deletedMessages: UIMessage[],
  remainingMessages: UIMessage[],
  currentStoryState: string,
  retryFeedback?: string,
): Promise<RollbackResult> {
  const elapsed = startTimer();
  const instruction = `You are a story state editor performing a rollback.

The user deleted messages from the conversation. Remove state that was introduced only in deleted messages, and keep state that still exists in the remaining conversation.

Rules:
1. Remove facts, scene details, demeanor changes, relationship shifts, and thread changes introduced only in deleted messages.
2. Preserve information already established in remaining messages.
3. Revert Scene and Current Demeanor to match the end of remaining messages.
4. For Open Threads, remove threads created in deleted messages and restore threads that were only resolved in deleted messages.
5. For Hard Facts, remove facts introduced only in deleted messages and restore earlier facts if deleted messages superseded them.
6. If uncertain, keep information instead of removing it.

Required output JSON:
{
  "updatedState": "complete markdown state with all required sections",
  "changes": [
    {
      "type": "scene_reverted|appearance_reverted|relationship_reverted|demeanor_reverted|hard_fact_removed|thread_removed|cast_change",
      "detail": "one line description",
      "sourceTurn": 0,
      "confidence": 0.9
    }
  ]
}

Deleted Messages:
${formatMessagesForPrompt(deletedMessages) || "(none)"}

Remaining Messages (most recent context):
${formatMessagesForPrompt(remainingMessages) || "(none)"}${retryFeedback ?? ""}`;

  const result = await generateText({
    model: openrouter(model),
    system:
      "You are analyzing a roleplay conversation to roll back story state changes." +
      "\n\nCurrent Story State:\n\n" +
      currentStoryState,
    messages: [
      { role: "user", content: [{ type: "text", text: instruction }] },
    ],
    temperature: 0.1,
    maxOutputTokens: 3072,
    providerOptions: {
      openrouter: {
        reasoning: { effort: "high" as const },
        ...(providerOrder.length > 0
          ? { provider: { order: [...providerOrder] } }
          : {}),
      },
    },
  });

  logResponse("/api/state-rollback", elapsed(), result.text);

  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      updatedState?: string;
      changes?: ExtractedFact[];
    };
    return {
      updatedState: (parsed.updatedState ?? "").trim(),
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    };
  } catch {
    logWarn(
      "/api/state-rollback: failed to parse LLM JSON, using no-op fallback",
    );
    return { updatedState: "", changes: [] };
  }
}

function noOpRollbackResponse(body: RollbackRequestBody) {
  return Response.json({
    newState: body.currentStoryState,
    extractedFacts: [],
    validation: PASS_VALIDATION,
    disposition: "rollback",
    cascadeResets: [],
    turnNumber: body.turnNumber,
  });
}

function evaluateRollbackResult(
  updatedState: string,
  currentStoryState: string,
  changes: ExtractedFact[],
): EvaluatedRollbackResult {
  const validation = validateState(updatedState, currentStoryState, changes);
  const disposition = determineDisposition(validation);
  return {
    updatedState,
    changes,
    validation,
    disposition,
  };
}

async function retryRollbackIfNeeded(
  body: RollbackRequestBody,
  model: string,
  providerOrder: readonly string[],
  evaluated: EvaluatedRollbackResult,
): Promise<EvaluatedRollbackResult> {
  if (evaluated.disposition !== "retried") return evaluated;

  const retryFeedback = buildRetryFeedback(evaluated.validation);
  const retry = await runRollback(
    model,
    providerOrder,
    body.deletedMessages,
    body.remainingMessages,
    body.currentStoryState,
    retryFeedback,
  );
  if (!retry.updatedState) return evaluated;

  return evaluateRollbackResult(
    retry.updatedState,
    body.currentStoryState,
    retry.changes,
  );
}

async function runRollbackPipeline(body: RollbackRequestBody) {
  const model = body.model ?? DEFAULT_MODEL_ID;
  const providerOrder =
    getModelEntry(model)?.providers ??
    getModelEntry(DEFAULT_MODEL_ID)?.providers ??
    [];

  const { updatedState, changes } = await runRollback(
    model,
    providerOrder,
    body.deletedMessages,
    body.remainingMessages,
    body.currentStoryState,
  );

  if (!updatedState) return noOpRollbackResponse(body);

  const firstPass = evaluateRollbackResult(
    updatedState,
    body.currentStoryState,
    changes,
  );
  const finalResult = await retryRollbackIfNeeded(
    body,
    model,
    providerOrder,
    firstPass,
  );
  if (finalResult.disposition === "retried") return noOpRollbackResponse(body);

  try {
    await pruneEmbeddingsForRollback(body.conversationId, body.turnNumber);
  } catch (error) {
    logWarn("/api/state-rollback: failed to prune message embeddings", error);
  }

  return Response.json({
    newState: finalResult.updatedState,
    extractedFacts: finalResult.changes,
    validation: finalResult.validation,
    disposition: "rollback",
    cascadeResets: computeCascadeResets(finalResult.changes),
    turnNumber: body.turnNumber,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RollbackRequestBody;

    logRequest("/api/state-rollback", {
      deletedCount: body.deletedMessages.length,
      remainingCount: body.remainingMessages.length,
      turnNumber: body.turnNumber,
      conversationId: body.conversationId,
      model: body.model,
    });

    if (!body.currentStoryState.trim() || body.deletedMessages.length === 0) {
      return noOpRollbackResponse(body);
    }

    return runRollbackPipeline(body);
  } catch (error) {
    logError("State rollback API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
