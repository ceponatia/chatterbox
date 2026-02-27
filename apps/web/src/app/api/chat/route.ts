import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import {
  logRequest,
  startTimer,
  logStreamStart,
  logStreamEnd,
  logReasoning,
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
import { parseStateFields } from "@/lib/state-utils";
import { env, getBaseUrl } from "@/lib/env";

interface ChatSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tokenBudget?: number;
}

function buildSystemPrompt(assemblyPrompt: string, storyState: string): string {
  const stateSection = storyState
    ? `\n\n## Current Story State\n\nThe following is the current canon of this roleplay. All facts listed are established truth — do not contradict them, especially Hard Facts.\n\n${storyState}`
    : "";
  return `${assemblyPrompt}${stateSection}\n\n${NPC_ONLY_GUARDRAIL}`;
}

const defaultAssembler = createDefaultAssembler();

const NPC_ONLY_GUARDRAIL = [
  "## Response Boundary (Critical)",
  "- NEVER write dialogue, actions, thoughts, or decisions on behalf of the user/player.",
  "- Only write for NPCs and the environment.",
  "- Leave all user/player speech and choices for the user to provide.",
].join("\n");

const MAX_MESSAGES = 40;

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  headers: { "HTTP-Referer": getBaseUrl(), "X-Title": "Chatterbox" },
});

function windowMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  log(
    `  \x1b[2m✂ windowed ${messages.length} → ${MAX_MESSAGES} messages\x1b[0m`,
    "info",
  );
  return messages.slice(-MAX_MESSAGES);
}

const SETTING_DEFAULTS = {
  temperature: 0.85,
  maxTokens: 1024,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

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

async function buildAssemblyContext(
  messages: UIMessage[],
  storyState: string,
  settings: ChatSettings,
  lastIncludedAt?: Record<string, number>,
): Promise<AssemblyContext> {
  const turnNumber = messages.filter((m) => m.role === "user").length;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.parts?.find((p) => p.type === "text");
  const currentUserMessage =
    userText && userText.type === "text" ? userText.text : "";
  const topicScores = await computeTopicScores(currentUserMessage);
  return {
    turnNumber,
    lastIncludedAt: lastIncludedAt ?? {},
    currentUserMessage,
    stateFields: parseStateFields(storyState),
    tokenBudget: settings.tokenBudget ?? 2500,
    topicScores,
  };
}

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
    `  \x1b[2m🧩 assembly t${ctx.turnNumber}: ` +
      `${assembly.included.length} included, ${assembly.omitted.length} omitted, ` +
      `~${assembly.tokenEstimate}/${ctx.tokenBudget} tokens (${budgetPct}%)` +
      (reasonSummary ? ` | omit: ${reasonSummary}` : "") +
      `\x1b[0m`,
    "info",
  );
}

function streamCallbacks(elapsed: () => number) {
  return {
    onError({ error }: { error: unknown }) {
      logError("/api/chat stream error:", error);
    },
    onFinish({
      text,
      reasoningText,
    }: {
      text: string;
      reasoningText?: string;
    }) {
      logReasoning("/api/chat", reasoningText);
      logStreamEnd("/api/chat", elapsed(), text.length);
      if (text.length === 0 && !reasoningText)
        logWarn("/api/chat: 0 chars returned");
    },
  };
}

export async function POST(req: Request) {
  const {
    messages,
    systemPrompt: _rawSystemPrompt,
    storyState,
    settings,
    lastIncludedAt,
    customSegments,
  } = (await req.json()) as {
    messages: UIMessage[];
    systemPrompt: string;
    storyState: string;
    settings: ChatSettings;
    lastIncludedAt?: Record<string, number>;
    customSegments?: SerializedSegment[] | null;
  };

  const windowed = windowMessages(messages);
  const elapsed = startTimer();
  const ctx = await buildAssemblyContext(
    messages,
    storyState,
    settings,
    lastIncludedAt,
  );
  const assembler = customSegments
    ? createAssemblerFromSerialized(customSegments)
    : defaultAssembler;
  const assembly = assembler.assemble(ctx);
  const system = buildSystemPrompt(assembly.systemPrompt, storyState);

  logAssembly(assembly, ctx);
  logRequest("/api/chat", { messages: windowed, storyState, settings });

  try {
    const result = streamText({
      model: openrouter(env.OPENROUTER_MODEL),
      system,
      messages: await convertToModelMessages(windowed),
      ...resolveSettings(settings),
      providerOptions: {
        openrouter: {
          reasoning: { effort: "high" },
          provider: {
            order: [
              "SiliconFlow",
              "GMICloud",
              "Friendli",
              "Venice",
              "AtlasCloud",
            ],
          },
        },
      },
      ...streamCallbacks(elapsed),
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
