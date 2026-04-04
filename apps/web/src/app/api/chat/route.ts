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
} from "@chatterbox/prompt-assembly";
import type {
  AssemblyContext,
  AssemblyResult,
  SerializedSegment,
} from "@chatterbox/prompt-assembly";
import { computeTopicScores } from "@/lib/topic-embeddings";
import {
  embedMessagePairs,
  retrieveSimilarPairs,
} from "@/lib/message-embeddings";
import { getUserId } from "@/lib/get-user-id";
import { parseStateFields } from "@/lib/state-utils";
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
  extractPrimaryUserFromCast,
  buildRuntimePlayerBoundary,
} from "./system-prompt";
import { streamCallbacks } from "./stream-telemetry";
import { generateGlmDraft, buildAionMessages } from "./aion-draft";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface ChatSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tokenBudget?: number;
}

const AION_NO_TOOL_USE_MODEL_ID = "aion-labs/aion-2.0";

const SETTING_DEFAULTS = {
  temperature: 0.85,
  maxTokens: 1024,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

const defaultAssembler = createDefaultAssembler();

function resolveSettings(s: ChatSettings) {
  const merged = { ...SETTING_DEFAULTS, ...s };
  return {
    temperature: merged.temperature,
    maxOutputTokens: merged.maxTokens,
    topP: merged.topP,
    frequencyPenalty: merged.frequencyPenalty,
    presencePenalty: merged.presencePenalty,
  };
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
// Logging
// ---------------------------------------------------------------------------

function logAssembly(assembly: AssemblyResult, ctx: AssemblyContext) {
  const budgetPct = Math.round(
    (assembly.tokenEstimate / ctx.tokenBudget) * 100,
  );
  const omittedReasons = new Map<string, number>();
  for (const o of assembly.omitted) {
    omittedReasons.set(o.reason, (omittedReasons.get(o.reason) ?? 0) + 1);
  }
  const reasonSummary = [...omittedReasons.entries()]
    .map(([r, n]) => `${r}(${n})`)
    .join(", ");
  log(
    `  \x1b[2m\u{1f9e9} assembly t${ctx.turnNumber}: ` +
      `${assembly.included.length} included, ${assembly.omitted.length} omitted, ` +
      `~${assembly.tokenEstimate}/${ctx.tokenBudget} tokens (${budgetPct}%)` +
      (reasonSummary ? ` | omit: ${reasonSummary}` : "") +
      `\x1b[0m`,
    "info",
  );
}

function logCompression(stats: {
  total: number;
  verbatim: number;
  summary: number;
  digest: number;
  promotedToVerbatim: number;
  promotedToSummary: number;
}) {
  if (stats.total <= VERBATIM_TIER_SIZE) return;
  log(
    `  \x1b[2m\u{1f5dc} history: total=${stats.total}, verbatim=${stats.verbatim}, summary=${stats.summary}, digest=${stats.digest}, promotions(v=${stats.promotedToVerbatim}, s=${stats.promotedToSummary})\x1b[0m`,
    "info",
  );
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

function injectDepthNote(
  modelMessages: ModelMessage[],
  storyState: string,
  presentEntityIds: string[],
): number {
  const depthNote = buildDepthNote(storyState, presentEntityIds);
  if (!depthNote || modelMessages.length < 3) return 0;
  modelMessages.splice(modelMessages.length - 2, 0, {
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
  const depthNoteChars = injectDepthNote(
    modelMessages,
    storyState,
    presentEntityIds,
  );
  const ragContext = await retrieveRagContext(
    conversationId,
    windowed,
    currentUserMessage,
  );
  if (ragContext && modelMessages.length >= 5) {
    modelMessages.splice(modelMessages.length - 4, 0, {
      role: "system",
      content: ragContext,
    });
  }

  const windowedChars = estimateMessagesChars(windowed);
  const verbatimChars = estimateMessagesChars(compressed.verbatimMessages);
  const historySummaryChars = compressed.historySummary?.length ?? 0;

  return {
    compressed,
    modelMessages,
    historySummaryMessage: compressed.historySummary
      ? [{ role: "system" as const, content: compressed.historySummary }]
      : [],
    ragSummaryMessage:
      ragContext && modelMessages.length < 5
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
  return {
    tools,
    stopWhen: stepCountIs(3),
    prepareStep: ({ stepNumber }: { stepNumber: number }) => {
      if (mustUseStoryContext && stepNumber === 0) {
        return {
          toolChoice: {
            type: "tool" as const,
            toolName: "get_story_context" as const,
          },
        };
      }
      return {};
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
  const assembler = customSegments
    ? createAssemblerFromSerialized(customSegments)
    : defaultAssembler;
  const assembly = assembler.assemble(ctx);
  const allSegments = assembler.listSegments();
  const tools = createChatTools(allSegments, storyState);

  const primaryUserAlias = extractPrimaryUserFromCast(storyState);
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
  const entityIds = presentEntityIds ?? [];
  const prompt = await preparePrompt(
    messages,
    storyState,
    settings,
    entityIds,
    lastIncludedAt,
    customSegments,
  );
  logRequest("/api/chat", {
    conversationId,
    messages: windowed,
    storyState,
    settings,
  });

  try {
    const providerOrder = getProviderOrder(prompt.modelId);

    const convCtx = await buildConversationContext(
      windowed,
      conversationId ?? undefined,
      prompt.ctx.currentUserMessage,
      storyState,
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
