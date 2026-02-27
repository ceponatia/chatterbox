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
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";

interface ChatSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tokenBudget?: number;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function normalizeAlias(raw: string): string | null {
  const cleaned = raw.trim().replace(/^["'“”‘’]|["'“”‘’.!,?:;]+$/g, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2}$/.test(cleaned)) {
    return null;
  }
  if (["I", "Im", "I'm", "My", "Me"].includes(cleaned)) return null;
  return cleaned;
}

function extractPrimaryUserFromCast(storyState: string): string | null {
  const castSection = storyState.match(/##\s*Cast\b([\s\S]*?)(?=\n##\s+|$)/i);
  if (!castSection) return null;
  const castBody = castSection[1] ?? "";
  if (!castBody) return null;

  const nameMatches = [...castBody.matchAll(/^\s*-\s+\*\*(.+?)\*\*/gm)];
  const secondMember = nameMatches[1]?.[1];
  if (!secondMember) return null;
  return normalizeAlias(secondMember);
}

function buildRuntimePlayerBoundary(primaryUserAlias: string | null): string {
  const identityClause = primaryUserAlias
    ? `- There is exactly ONE primary user character in this session: "${primaryUserAlias}".\n- Treat only "${primaryUserAlias}" as {{ user }}. All other named characters are NPCs unless explicitly changed in story state.`
    : "- There is exactly ONE primary user character, but it could not be resolved from Cast.\n- Until Cast is resolved, treat ambiguous identity as player-controlled and avoid writing for that character.";

  return [
    "## Player Control Boundary (Critical)",
    "- The second member of the Cast list is the canonical {{ user }} identity.",
    identityClause,
    "- NEVER write dialogue, actions, thoughts, decisions, intentions, or internal state for the player-controlled entity.",
    "- NEVER decide what the player says, does, feels, notices, or concludes.",
    "- If a sentence would make the player-controlled character the subject of a new action or thought, do not write it.",
    "- If identity is ambiguous, ask an in-world clarifying question and continue with NPC/environment narration only.",
  ].join("\n");
}

function buildSystemPrompt(
  assemblyPrompt: string,
  storyState: string,
  runtimeBoundary: string,
): string {
  const stateSection = storyState
    ? `\n\n## Current Story State\n\nThe following is the current canon of this roleplay. All facts listed are established truth — do not contradict them, especially Hard Facts.\n\n${storyState}`
    : "";
  return `${assemblyPrompt}${stateSection}\n\n${runtimeBoundary}\n\n${NPC_ONLY_GUARDRAIL}`;
}

const defaultAssembler = createDefaultAssembler();

const NPC_ONLY_GUARDRAIL = [
  "## Response Boundary (Critical)",
  "- NEVER write dialogue, actions, thoughts, decisions, intentions, or internal state on behalf of the user/player.",
  "- Only write for NPCs and the environment.",
  "- Leave all user/player speech, actions, and choices for the user to provide.",
  "- If uncertain whether a named person is the user/player, treat them as player-controlled and avoid writing for them.",
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
  const currentUserMessage = lastUserMsg ? getMessageText(lastUserMsg) : "";
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
  const primaryUserAlias = extractPrimaryUserFromCast(storyState);
  const runtimeBoundary = buildRuntimePlayerBoundary(primaryUserAlias);
  const system = buildSystemPrompt(
    assembly.systemPrompt,
    storyState,
    runtimeBoundary,
  );

  logAssembly(assembly, ctx);
  if (primaryUserAlias) {
    log(
      `  \x1b[2m🪪 primary user bound from Cast[2]: ${primaryUserAlias}\x1b[0m`,
      "info",
    );
  } else {
    logWarn("/api/chat: could not resolve primary user from Cast[2]");
  }
  logRequest("/api/chat", { messages: windowed, storyState, settings });

  try {
    const modelId = settings.model ?? DEFAULT_MODEL_ID;
    const providerOrder =
      getModelEntry(modelId)?.providers ??
      getModelEntry(DEFAULT_MODEL_ID)?.providers ??
      [];

    const result = streamText({
      model: openrouter(modelId),
      system,
      messages: await convertToModelMessages(windowed),
      ...resolveSettings(settings),
      providerOptions: {
        openrouter: {
          reasoning: { effort: "high" },
          ...(providerOrder.length > 0
            ? { provider: { order: providerOrder } }
            : {}),
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
