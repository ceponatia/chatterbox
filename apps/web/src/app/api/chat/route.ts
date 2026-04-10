import {
  streamText,
  UIMessage,
  type ModelMessage,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import {
  logRequest,
  startTimer,
  logStreamStart,
  log,
  logWarn,
  logError,
} from "@/lib/api-logger";
import {
  createDefaultAssembler,
  createAssemblerFromSerialized,
  parseSystemPromptToSegments,
} from "@chatterbox/prompt-assembly";
import type {
  AssemblyContext,
  SerializedSegment,
} from "@chatterbox/prompt-assembly";
import { computeTopicScores } from "@/lib/topic-embeddings";
import {
  embedMessagePairs,
  retrieveSimilarPairs,
} from "@/lib/message-embeddings";
import { getUserId } from "@/lib/get-user-id";
import { parseStateFields } from "@/lib/state-utils";
import { prisma } from "@/lib/prisma";
import {
  parseMarkdownToStructured,
  structuredToMarkdown,
  type StructuredStoryState,
} from "@chatterbox/state-model";
import { resolveEffectiveStateWithTiers } from "@/lib/effective-state-enhanced";
import { openrouter, openrouterPlainText } from "@/lib/openrouter";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";
import { createChatTools } from "./chat-tools";
import {
  getMessageText,
  windowMessages,
  buildCompressedHistory,
  extractNewPairsForEmbedding,
  formatRagContext,
  estimateMessagesChars,
  VERBATIM_TIER_SIZE,
} from "./history-compression";
import { buildDepthNote } from "./depth-note";
import {
  buildSystemPrompt,
  extractPlayerFromSegments,
  extractPrimaryUserFromCast,
  buildRuntimePlayerBoundary,
} from "./system-prompt";
import { streamCallbacks } from "./stream-telemetry";
import { generateGlmDraft, buildAionMessages } from "./aion-draft";
import {
  type ChatSettings,
  AION_NO_TOOL_USE_MODEL_ID,
  resolveSettings,
  logAssembly,
  logCompression,
  stripOrphanedModelToolCalls,
} from "./chat-helpers";

const defaultAssembler = createDefaultAssembler();

// ---------------------------------------------------------------------------
// Baseline lookup for story-project-linked conversations
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
// Assembly context
// ---------------------------------------------------------------------------

async function buildAssemblyContext(
  messages: UIMessage[],
  storyState: string,
  settings: ChatSettings,
  presentEntityIds: readonly string[],
  lastIncludedAt?: Record<string, number>,
): Promise<AssemblyContext> {
  const turnNumber = messages.filter((m) => m.role === "user").length;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const currentUserMessage = lastUserMsg ? getMessageText(lastUserMsg) : "";
  const topicScores = await computeTopicScores(currentUserMessage);
  return {
    turnNumber,
    lastIncludedAt: lastIncludedAt ?? {},
    currentUserMessage,
    stateFields: parseStateFields(storyState),
    presentEntityIds,
    tokenBudget: settings.tokenBudget ?? 2500,
    topicScores,
  };
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

async function retrieveRagContext(
  conversationId: string | undefined,
  windowed: UIMessage[],
  currentUserMessage: string,
) {
  if (!conversationId || windowed.length <= VERBATIM_TIER_SIZE) return null;
  const similar = await retrieveSimilarPairs(
    conversationId,
    currentUserMessage,
    5,
  );
  if (similar.length === 0) return null;
  const ctx = formatRagContext(similar);
  log(
    `  \x1b[2m\u{1f50d} RAG: ${similar.length} pairs (${ctx.length} chars)\x1b[0m`,
    "info",
  );
  return ctx;
}

/**
 * Find a safe splice index that does not land between an assistant tool-call
 * and its tool-result message. If `target` points at a `tool` message, walk
 * backward to splice before the preceding `assistant` instead.
 */
function safeInsertIndex(messages: ModelMessage[], target: number): number {
  let idx = Math.max(0, Math.min(target, messages.length));
  while (idx > 0 && messages[idx]?.role === "tool") {
    idx--;
  }
  return idx;
}

function injectDepthNote(
  modelMessages: ModelMessage[],
  storyState: string,
  presentEntityIds: string[],
): number {
  const depthNote = buildDepthNote(storyState, presentEntityIds);
  if (!depthNote || modelMessages.length < 3) return 0;
  const depthIdx = safeInsertIndex(modelMessages, modelMessages.length - 2);
  modelMessages.splice(depthIdx, 0, {
    role: "system",
    content: depthNote,
  });
  log(
    `  \x1b[2m\u{1f4cc} depth-2 note injected (${depthNote.length} chars)\x1b[0m`,
    "info",
  );
  return depthNote.length;
}

async function buildConversationContext(
  windowed: UIMessage[],
  conversationId: string | undefined,
  currentUserMessage: string,
  storyState: string,
  presentEntityIds: string[],
) {
  const compressed = await buildCompressedHistory(windowed, conversationId);
  logCompression(compressed.stats);
  if (compressed.stats.digest > 0) {
    log(
      `  \x1b[2m\u{1f4dd} fact extraction: ${compressed.stats.digest} digest msgs\x1b[0m`,
      "info",
    );
  }

  const modelMessages = await convertToModelMessages(
    compressed.verbatimMessages,
    { ignoreIncompleteToolCalls: true },
  );
  const cleanedMessages = stripOrphanedModelToolCalls(modelMessages);

  const depthNoteChars = injectDepthNote(
    cleanedMessages,
    storyState,
    presentEntityIds,
  );
  const ragContext = await retrieveRagContext(
    conversationId,
    windowed,
    currentUserMessage,
  );
  if (ragContext && cleanedMessages.length >= 5) {
    const ragIdx = safeInsertIndex(cleanedMessages, cleanedMessages.length - 4);
    cleanedMessages.splice(ragIdx, 0, {
      role: "system",
      content: ragContext,
    });
  }

  const windowedChars = estimateMessagesChars(windowed);
  const verbatimChars = estimateMessagesChars(compressed.verbatimMessages);
  const historySummaryChars = compressed.historySummary?.length ?? 0;

  return {
    compressed,
    modelMessages: cleanedMessages,
    historySummaryMessage: compressed.historySummary
      ? [{ role: "system" as const, content: compressed.historySummary }]
      : [],
    ragSummaryMessage:
      ragContext && cleanedMessages.length < 5
        ? [{ role: "system" as const, content: ragContext }]
        : [],
    windowedChars,
    verbatimChars,
    historySummaryChars,
    depthNoteChars,
    effectiveContextChars: verbatimChars + historySummaryChars + depthNoteChars,
    compressionRatio:
      windowedChars > 0
        ? Number(
            (
              (verbatimChars + historySummaryChars + depthNoteChars) /
              windowedChars
            ).toFixed(4),
          )
        : 1,
  };
}

function buildToolConfig(
  toolUseEnabled: boolean,
  tools: ReturnType<typeof createChatTools>,
  mustUseStoryContext: boolean,
) {
  if (!toolUseEnabled) return {};
  const maxToolSteps = 3;
  return {
    tools,
    stopWhen: stepCountIs(maxToolSteps),
    prepareStep: ({ stepNumber }: { stepNumber: number }) => {
      const opts: Record<string, unknown> = {};
      if (mustUseStoryContext && stepNumber === 0) {
        opts.toolChoice = {
          type: "tool" as const,
          toolName: "get_story_context" as const,
        };
      }
      if (stepNumber >= maxToolSteps - 1) {
        opts.activeTools = [];
      }
      return opts;
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt preparation
// ---------------------------------------------------------------------------

interface PromptContext {
  ctx: AssemblyContext;
  systemMessages: ReturnType<typeof buildSystemPrompt>;
  tools: ReturnType<typeof createChatTools>;
  modelId: string;
  toolUseEnabled: boolean;
}

async function preparePrompt(
  messages: UIMessage[],
  rawSystemPrompt: string,
  storyState: string,
  settings: ChatSettings,
  entityIds: string[],
  lastIncludedAt: Record<string, number> | undefined,
  customSegments: SerializedSegment[] | null | undefined,
): Promise<PromptContext> {
  const ctx = await buildAssemblyContext(
    messages,
    storyState,
    settings,
    entityIds,
    lastIncludedAt,
  );
  const resolvedSegments =
    customSegments ??
    (rawSystemPrompt.trim().length > 0
      ? parseSystemPromptToSegments(rawSystemPrompt)
      : null);
  const assembler = customSegments
    ? createAssemblerFromSerialized(customSegments)
    : resolvedSegments
      ? createAssemblerFromSerialized(resolvedSegments)
      : defaultAssembler;
  const assembly = assembler.assemble(ctx);
  const allSegments = assembler.listSegments();
  const tools = createChatTools(allSegments, storyState);

  const primaryUserAlias =
    extractPlayerFromSegments(customSegments) ??
    extractPrimaryUserFromCast(storyState);
  const runtimeBoundary = buildRuntimePlayerBoundary(primaryUserAlias);
  const modelId = settings.model ?? DEFAULT_MODEL_ID;
  const toolUseEnabled = modelId !== AION_NO_TOOL_USE_MODEL_ID;

  const systemMessages = buildSystemPrompt(
    assembly.systemPrompt,
    storyState,
    runtimeBoundary,
    toolUseEnabled,
  );

  logAssembly(assembly, ctx);
  if (primaryUserAlias) {
    log(`  \x1b[2m\u{1faaa} primary user: ${primaryUserAlias}\x1b[0m`, "info");
  } else {
    logWarn("/api/chat: could not resolve primary user from Cast[2]");
  }

  return { ctx, systemMessages, tools, modelId, toolUseEnabled };
}

function getProviderOrder(modelId: string): string[] {
  return (
    getModelEntry(modelId)?.providers ??
    getModelEntry(DEFAULT_MODEL_ID)?.providers ??
    []
  );
}

function fireEmbeddingPipeline(
  conversationId: string | null | undefined,
  userId: string,
  messages: UIMessage[],
  windowed: UIMessage[],
  verbatimCount: number,
) {
  const pairsToEmbed = extractNewPairsForEmbedding(
    messages,
    windowed,
    verbatimCount,
  );
  if (pairsToEmbed.length > 0 && conversationId) {
    void embedMessagePairs(conversationId, userId, pairsToEmbed);
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

// eslint-disable-next-line max-lines-per-function
export async function POST(req: Request) {
  const userId = getUserId(req);
  const {
    conversationId,
    messages,
    systemPrompt: _rawSystemPrompt,
    storyState,
    settings,
    presentEntityIds,
    lastIncludedAt,
    customSegments,
  } = (await req.json()) as {
    conversationId?: string | null;
    messages: UIMessage[];
    systemPrompt: string;
    storyState: string;
    settings: ChatSettings;
    presentEntityIds?: string[];
    lastIncludedAt?: Record<string, number>;
    customSegments?: SerializedSegment[] | null;
  };

  const windowed = windowMessages(messages);
  const elapsed = startTimer();

  // Resolve effective state for story-project-linked conversations
  const baseline = await loadBaselineState(conversationId);
  let effectiveStoryState = storyState;
  let effectiveEntityIds = presentEntityIds ?? [];
  if (baseline) {
    const runtime = storyState.trim()
      ? parseMarkdownToStructured(storyState)
      : null;
    const effective = resolveEffectiveStateWithTiers({
      baseline,
      runtime,
    });
    effectiveStoryState = structuredToMarkdown(effective);
    effectiveEntityIds =
      effective.scene.presentEntityIds.length > 0
        ? effective.scene.presentEntityIds
        : effectiveEntityIds;
    log(
      `  \x1b[2m\u{1f504} effective state: baseline + runtime merged\x1b[0m`,
      "info",
    );
  }
  const entityIds = effectiveEntityIds;

  const prompt = await preparePrompt(
    messages,
    _rawSystemPrompt,
    effectiveStoryState,
    settings,
    entityIds,
    lastIncludedAt,
    customSegments,
  );
  logRequest("/api/chat", {
    conversationId,
    messages: windowed,
    storyState: effectiveStoryState,
    settings,
  });

  try {
    const providerOrder = getProviderOrder(prompt.modelId);

    const convCtx = await buildConversationContext(
      windowed,
      conversationId ?? undefined,
      prompt.ctx.currentUserMessage,
      effectiveStoryState,
      entityIds,
    );

    fireEmbeddingPipeline(
      conversationId,
      userId,
      messages,
      windowed,
      convCtx.compressed.stats.verbatim,
    );

    const mustUseStoryContext =
      /\b(relationship|relationships|thread|threads|hard fact|hard facts|recall|remember)\b/i.test(
        prompt.ctx.currentUserMessage,
      );

    const compressionMeta = {
      windowedMessages: windowed.length,
      windowedChars: convCtx.windowedChars,
      verbatimMessages: convCtx.compressed.stats.verbatim,
      verbatimChars: convCtx.verbatimChars,
      summaryMessages: convCtx.compressed.stats.summary,
      digestMessages: convCtx.compressed.stats.digest,
      promotedToVerbatim: convCtx.compressed.stats.promotedToVerbatim,
      promotedToSummary: convCtx.compressed.stats.promotedToSummary,
      hasHistorySummary: Boolean(convCtx.compressed.historySummary),
      historySummaryChars: convCtx.historySummaryChars,
      depthNoteChars: convCtx.depthNoteChars,
      effectiveContextChars: convCtx.effectiveContextChars,
      compressionRatio: convCtx.compressionRatio,
    };

    // -----------------------------------------------------------------------
    // Aion two-phase flow: GLM draft with tools -> Aion final response
    // -----------------------------------------------------------------------
    if (!prompt.toolUseEnabled) {
      const draft = await generateGlmDraft(
        prompt.systemMessages,
        convCtx.modelMessages,
        prompt.tools,
        resolveSettings(settings),
        mustUseStoryContext,
      );

      log(
        `  \x1b[2m\u{1f501} Aion two-phase: draft=${draft.draftText.length} chars, ` +
          `tools=${draft.toolCallCount}, steps=${draft.stepCount}, ` +
          `${draft.elapsedMs}ms\x1b[0m`,
        "info",
      );

      const aionMessages = buildAionMessages(
        prompt.systemMessages,
        convCtx.modelMessages,
        convCtx.historySummaryMessage,
        convCtx.ragSummaryMessage,
        draft,
      );

      const aionResult = streamText({
        model: openrouterPlainText(prompt.modelId),
        messages: aionMessages,
        ...resolveSettings(settings),
        providerOptions: {
          openrouter: {
            reasoning: { effort: "high" },
            ...(providerOrder.length > 0
              ? { provider: { order: providerOrder } }
              : {}),
          },
        },
        ...streamCallbacks(elapsed, {
          route: "/api/chat",
          modelId: prompt.modelId,
          turnNumber: prompt.ctx.turnNumber,
          compression: compressionMeta,
        }),
      });

      logStreamStart("/api/chat (Aion two-phase)");
      return aionResult.toUIMessageStreamResponse();
    }

    // -----------------------------------------------------------------------
    // Normal flow: direct tool-calling model
    // -----------------------------------------------------------------------
    const requestMessages = [
      ...prompt.systemMessages,
      ...convCtx.historySummaryMessage,
      ...convCtx.ragSummaryMessage,
      ...convCtx.modelMessages,
    ] as unknown as ModelMessage[];

    const result = streamText({
      model: openrouter(prompt.modelId),
      messages: requestMessages,
      ...buildToolConfig(
        prompt.toolUseEnabled,
        prompt.tools,
        mustUseStoryContext,
      ),
      ...resolveSettings(settings),
      providerOptions: {
        openrouter: {
          reasoning: { effort: "high" },
          ...(providerOrder.length > 0
            ? { provider: { order: providerOrder } }
            : {}),
        },
      },
      ...streamCallbacks(elapsed, {
        route: "/api/chat",
        modelId: prompt.modelId,
        turnNumber: prompt.ctx.turnNumber,
        compression: compressionMeta,
      }),
    });

    logStreamStart("/api/chat");
    return result.toUIMessageStreamResponse();
  } catch (error) {
    logError("/api/chat fatal error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
