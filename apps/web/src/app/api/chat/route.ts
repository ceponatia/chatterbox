import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { logRequest, startTimer, logStreamStart, logStreamEnd, logReasoning } from "@/lib/api-logger";

interface ChatSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

const MAX_MESSAGES = 40;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Chatterbox" },
});

function buildSystem(systemPrompt: string, storyState: string): string {
  return storyState ? `${systemPrompt}\n\n## Current Story State\n${storyState}` : systemPrompt;
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
  const { messages, systemPrompt, storyState, settings } = (await req.json()) as {
    messages: UIMessage[]; systemPrompt: string; storyState: string; settings: ChatSettings;
  };

  const windowed = windowMessages(messages);
  logRequest("/api/chat", { messages: windowed, systemPrompt, storyState, settings });
  const elapsed = startTimer();

  try {
    const result = streamText({
      model: openrouter(process.env.OPENROUTER_MODEL || "z-ai/glm-5"),
      system: buildSystem(systemPrompt, storyState),
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
