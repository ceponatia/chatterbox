import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { logRequest, startTimer, logStreamStart, logStreamEnd, logReasoning } from "@/lib/api-logger";
import { createDefaultAssembler } from "@chatterbox/prompt-assembly";
import type { AssemblyContext, AssemblyResult } from "@chatterbox/prompt-assembly";

interface ChatSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tokenBudget?: number;
}

const assembler = createDefaultAssembler();

const MAX_MESSAGES = 40;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Chatterbox" },
});

/** Parse story state markdown into field map for on_state_field policies. */
function parseStateFields(storyState: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const sections = storyState.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx === -1) continue;
    const key = section.slice(0, newlineIdx).trim().toLowerCase().replace(/\s+/g, "_");
    const value = section.slice(newlineIdx + 1).trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}

function windowMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  console.log(`  \x1b[2m✂ windowed ${messages.length} → ${MAX_MESSAGES} messages\x1b[0m`);
  return messages.slice(-MAX_MESSAGES);
}

const SETTING_DEFAULTS = { temperature: 0.85, maxTokens: 1024, topP: 1, frequencyPenalty: 0, presencePenalty: 0 };

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

function buildAssemblyContext(
  messages: UIMessage[], storyState: string, settings: ChatSettings, lastIncludedAt?: Record<string, number>,
): AssemblyContext {
  const turnNumber = messages.filter(m => m.role === "user").length;
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const userText = lastUserMsg?.parts?.find(p => p.type === "text");
  const currentUserMessage = userText && userText.type === "text" ? userText.text : "";
  return {
    turnNumber,
    lastIncludedAt: lastIncludedAt ?? {},
    currentUserMessage,
    stateFields: parseStateFields(storyState),
    tokenBudget: settings.tokenBudget ?? 2500,
  };
}

function logAssembly(assembly: AssemblyResult, ctx: AssemblyContext) {
  const budgetPct = Math.round((assembly.tokenEstimate / ctx.tokenBudget) * 100);
  const omittedReasons = new Map<string, number>();
  for (const o of assembly.omitted) {
    omittedReasons.set(o.reason, (omittedReasons.get(o.reason) ?? 0) + 1);
  }
  const reasonSummary = [...omittedReasons.entries()].map(([r, n]) => `${r}(${n})`).join(", ");
  console.log(
    `  \x1b[2m🧩 assembly t${ctx.turnNumber}: ` +
    `${assembly.included.length} included, ${assembly.omitted.length} omitted, ` +
    `~${assembly.tokenEstimate}/${ctx.tokenBudget} tokens (${budgetPct}%)` +
    (reasonSummary ? ` | omit: ${reasonSummary}` : "") +
    `\x1b[0m`,
  );
}

function streamCallbacks(elapsed: () => number) {
  return {
    onError({ error }: { error: unknown }) { console.error(`\x1b[31m✗ /api/chat stream error:\x1b[0m`, error); },
    onFinish({ text, reasoningText }: { text: string; reasoningText?: string }) {
      logReasoning("/api/chat", reasoningText);
      logStreamEnd("/api/chat", elapsed(), text.length);
      if (text.length === 0 && !reasoningText) console.warn(`\x1b[33m⚠ /api/chat: 0 chars returned\x1b[0m`);
    },
  };
}

export async function POST(req: Request) {
  const { messages, systemPrompt: _rawSystemPrompt, storyState, settings, lastIncludedAt } = (await req.json()) as {
    messages: UIMessage[]; systemPrompt: string; storyState: string; settings: ChatSettings;
    lastIncludedAt?: Record<string, number>;
  };

  const windowed = windowMessages(messages);
  const elapsed = startTimer();
  const ctx = buildAssemblyContext(messages, storyState, settings, lastIncludedAt);
  const assembly = assembler.assemble(ctx);
  const system = storyState
    ? `${assembly.systemPrompt}\n\n## Current Story State\n${storyState}`
    : assembly.systemPrompt;

  logAssembly(assembly, ctx);
  logRequest("/api/chat", { messages: windowed, storyState, settings });

  try {
    const result = streamText({
      model: openrouter(process.env.OPENROUTER_MODEL || "z-ai/glm-5"),
      system,
      messages: await convertToModelMessages(windowed),
      ...resolveSettings(settings),
      providerOptions: { openrouter: { reasoning: { effort: "high" }, provider: { order: ["Phala", "NovitaAI", "Z.ai"] } } },
      ...streamCallbacks(elapsed),
    });
    logStreamStart("/api/chat");
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error(`\x1b[31m✗ /api/chat fatal error:\x1b[0m`, error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
