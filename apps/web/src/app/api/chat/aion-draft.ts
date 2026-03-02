import { generateText, type ModelMessage, stepCountIs } from "ai";
import { log, logWarn } from "@/lib/api-logger";
import { openrouter } from "@/lib/openrouter";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";
import type { createChatTools } from "./chat-tools";
import type { SystemPromptMessage } from "./system-prompt";
import { createSystemMessage } from "./system-prompt";
import { sanitizeMessagesForPlainText } from "./tool-bypass";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAFT_MODEL_ID = DEFAULT_MODEL_ID;

const DRAFT_MAX_OUTPUT_TOKENS = 800;

const DRAFT_INSTRUCTION = [
  "",
  "## Draft Mode",
  "You are producing a research draft, not the final response.",
  "Call tools to gather relevant context for this turn, then write a brief",
  "draft covering the key narrative beats and reasoning.",
  "Include notes on what you found and why you made certain choices.",
  "Another model will write the final response using your research.",
].join("\n");

const AION_FRAMING_NOTE = [
  "## Research Context",
  "The following tool results and draft were gathered by a research assistant.",
  "Tool results are authoritative facts -- maintain consistency with them.",
  "The draft suggests narrative direction but is not final text.",
  "Write your response in your own voice, using the research as grounding.",
].join("\n");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftResult {
  draftText: string;
  toolResultSections: string[];
  toolCallCount: number;
  stepCount: number;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// GLM draft generation (Phase 1)
// ---------------------------------------------------------------------------

export async function generateGlmDraft(
  systemMessages: SystemPromptMessage[],
  conversationMessages: ModelMessage[],
  tools: ReturnType<typeof createChatTools>,
  resolvedSettings: {
    temperature: number;
    maxOutputTokens: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
  },
  mustUseStoryContext: boolean,
): Promise<DraftResult> {
  const start = performance.now();

  const draftSystemMessages = appendDraftInstruction(systemMessages);

  const providerOrder =
    getModelEntry(DRAFT_MODEL_ID)?.providers ??
    getModelEntry(DEFAULT_MODEL_ID)?.providers ??
    [];

  const result = await generateText({
    model: openrouter(DRAFT_MODEL_ID),
    messages: [
      ...draftSystemMessages,
      ...conversationMessages,
    ] as unknown as ModelMessage[],
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
    ...resolvedSettings,
    maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
    providerOptions: {
      openrouter: {
        reasoning: { effort: "high" },
        ...(providerOrder.length > 0
          ? { provider: { order: providerOrder } }
          : {}),
      },
    },
  });

  const toolResultSections = extractToolResultSections(result.steps);
  const elapsedMs = Math.round(performance.now() - start);

  log(
    `  \x1b[2m\u{1f4dd} GLM draft: ${result.text.length} chars, ` +
      `${toolResultSections.length} tool results, ` +
      `${elapsedMs}ms\x1b[0m`,
    "info",
  );

  if (!result.text) {
    logWarn(
      "GLM draft produced empty text; Aion will rely on tool results only",
    );
  }

  return {
    draftText: result.text,
    toolResultSections,
    toolCallCount: countToolCalls(result.steps),
    stepCount: result.steps.length,
    elapsedMs,
  };
}

// ---------------------------------------------------------------------------
// Build Aion messages with draft context (Phase 2)
// ---------------------------------------------------------------------------

export function buildAionMessages(
  systemMessages: SystemPromptMessage[],
  conversationMessages: ModelMessage[],
  historySummaryMessage: Array<{ role: "system"; content: string }>,
  ragSummaryMessage: Array<{ role: "system"; content: string }>,
  draft: DraftResult,
): ModelMessage[] {
  const sanitized = sanitizeMessagesForPlainText(conversationMessages);

  const draftContext = formatDraftContext(draft);

  return [
    ...systemMessages,
    ...historySummaryMessage,
    ...ragSummaryMessage,
    createSystemMessage(draftContext, false),
    ...sanitized,
  ] as unknown as ModelMessage[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function appendDraftInstruction(
  systemMessages: SystemPromptMessage[],
): SystemPromptMessage[] {
  if (systemMessages.length === 0) return systemMessages;
  const copy = systemMessages.map((m) => ({ ...m }));
  const first = copy[0];
  if (first) {
    first.content = first.content + DRAFT_INSTRUCTION;
  }
  return copy;
}

function formatDraftContext(draft: DraftResult): string {
  const sections: string[] = [AION_FRAMING_NOTE, ""];

  if (draft.toolResultSections.length > 0) {
    sections.push("### Tool Results");
    sections.push(...draft.toolResultSections);
    sections.push("");
  }

  if (draft.draftText) {
    sections.push("### Draft");
    sections.push(draft.draftText);
  }

  return sections.join("\n");
}

interface StepLike {
  toolCalls?: unknown[];
  toolResults?: unknown[];
}

function extractToolResultSections(steps: StepLike[]): string[] {
  const sections: string[] = [];
  for (const step of steps) {
    const calls = step.toolCalls ?? [];
    const results = step.toolResults ?? [];
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i] as Record<string, unknown> | undefined;
      const toolResult = results[i] as Record<string, unknown> | undefined;
      if (!call || !toolResult) continue;

      const toolName = (call.toolName ?? call.name ?? "tool") as string;
      const resultValue =
        (toolResult as Record<string, unknown>).result ?? toolResult;
      let resultText: string;
      try {
        resultText =
          typeof resultValue === "string"
            ? resultValue
            : JSON.stringify(resultValue, null, 2);
      } catch {
        resultText = String(resultValue);
      }
      sections.push(`**${toolName}:**\n${resultText}`);
    }
  }
  return sections;
}

function countToolCalls(steps: StepLike[]): number {
  let count = 0;
  for (const step of steps) {
    count += (step.toolCalls ?? []).length;
  }
  return count;
}
