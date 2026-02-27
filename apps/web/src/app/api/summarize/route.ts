import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, UIMessage, convertToModelMessages } from "ai";
import {
  logRequest,
  startTimer,
  logResponse,
  logReasoning,
  logWarn,
  logError,
} from "@/lib/api-logger";
import { env, getBaseUrl } from "@/lib/env";

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": getBaseUrl(),
    "X-Title": "Chatterbox",
  },
});

const REQUIRED_SECTIONS = [
  "## Cast",
  "## Relationships",
  "## Appearance",
  "## Scene",
  "## Current Demeanor",
  "## Open Threads",
  "## Hard Facts",
];

function isStateComplete(text: string): boolean {
  return REQUIRED_SECTIONS.every((section) => text.includes(section));
}

const SUMMARIZE_INSTRUCTION = `Update the Story State for continuity. Keep it under 1200 tokens. Use EXACTLY the following sections in this order:

## Cast
- One bullet per character: **Name** — age, role, 1-line summary of who they are right now.
- Include any new characters introduced in conversation.
- Keep {{ user }}'s entry as "[player character, do not narrate]" plus their established physical/biographical details.

## Relationships
- One bullet per significant relationship: **A → B**: current dynamic, trust level, tension points.
- Use sub-bullets for nuance (motivations, internal conflicts).
- Update based on how interactions have shifted feelings or trust.

## Appearance
- Only update if clothing, hair, or presentation changed during the conversation.
- Use format: **Name — aspect**: description.
- Preserve existing appearance details that haven't changed.
- Sensory details if they were brought up, for example the scent of {{ char }}'s perfume, feet, body, etc.

## Scene
- **Where/When**: current location and time of day AS OF THE MOST RECENT MESSAGES. This must reflect where the characters are NOW, not where they were earlier.
- **Who is present**: list everyone currently in the scene.
- **Atmosphere**: emotional tone, sensory details (lighting, sounds, temperature).
- IMPORTANT: This section changes frequently. Always update it to match the end of the conversation.

## Current Demeanor
- **Each character's mood**: 2-3 adjectives summarizing their emotional state RIGHT NOW based on the most recent messages.
- **Energy between them**: one line on the current interpersonal dynamic (tension, comfort, flirtation, etc.).
- IMPORTANT: Do NOT copy the old demeanor. Re-evaluate based on the conversation's current tone.

## Open Threads
- 3-8 bullets of unresolved narrative hooks, questions, or tensions.
- REMOVE threads that have been resolved or are no longer relevant.
- Add new ones that emerged from recent conversation.
- IMPORTANT: Review each existing thread — if the conversation has moved past it, drop it.

## Hard Facts
- Canon facts that must not drift or be forgotten.
- Preserve ALL existing hard facts unless explicitly contradicted in the conversation.
- Add new facts established in conversation (confessions, reveals, decisions).

Important rules:
- Do not invent facts not established in the conversation or existing Story State.
- Keep {{ user }}'s cast entry as "[player character, do not narrate]".
- Preserve existing details in every section unless they changed — do not drop information.
- Output ONLY the updated Story State block, no commentary or preamble.`;

const PROVIDER_OPTIONS = {
  openrouter: {
    reasoning: { effort: "medium" as const },
    provider: {
      order: ["SiliconFlow", "GMICloud", "Friendli", "Venice", "AtlasCloud"],
    },
  },
};

type GenerateResult = Awaited<ReturnType<typeof generateText>>;
type ModelMessages = NonNullable<
  Parameters<typeof generateText>[0]["messages"]
>;

async function generateWithRetries(
  model: string,
  system: string,
  modelMessages: ModelMessages,
  elapsed: () => number,
): Promise<GenerateResult> {
  const generate = (maxTokens = 2048) =>
    generateText({
      model: openrouter(model),
      system,
      messages: modelMessages,
      temperature: 0.4,
      maxOutputTokens: maxTokens,
      providerOptions: PROVIDER_OPTIONS,
    });

  let result = await generate();
  logReasoning("/api/summarize", result.reasoningText);
  logResponse("/api/summarize", elapsed(), result.text);

  // Retry on truncation or empty response
  if (result.finishReason === "length" || !result.text.trim()) {
    logWarn(
      `/api/summarize: ${result.finishReason === "length" ? "truncated" : "empty"}, retrying…`,
    );
    const retryElapsed = startTimer();
    result = await generate();
    logReasoning("/api/summarize (retry)", result.reasoningText);
    logResponse("/api/summarize (retry)", retryElapsed(), result.text);
  }

  // If still truncated, escalate with higher token limit
  if (result.finishReason === "length") {
    logWarn("/api/summarize: still truncated, retrying with 4096 limit…");
    const escalateElapsed = startTimer();
    result = await generate(4096);
    logReasoning("/api/summarize (escalate)", result.reasoningText);
    logResponse("/api/summarize (escalate)", escalateElapsed(), result.text);
  }

  // Structural completeness check — retry if sections are missing
  if (result.text.trim() && !isStateComplete(result.text)) {
    logWarn("/api/summarize: missing required sections, retrying…");
    const structElapsed = startTimer();
    result = await generate();
    logReasoning("/api/summarize (struct-retry)", result.reasoningText);
    logResponse("/api/summarize (struct-retry)", structElapsed(), result.text);
  }

  return result;
}

export async function POST(req: Request) {
  try {
    const { messages, currentStoryState, systemPrompt } =
      (await req.json()) as {
        messages: UIMessage[];
        currentStoryState: string;
        systemPrompt: string;
      };

    logRequest("/api/summarize", { messages, currentStoryState, systemPrompt });
    const elapsed = startTimer();

    const model = env.OPENROUTER_MODEL;

    const system = `${systemPrompt}\n\n## Current Story State\n${currentStoryState}`;

    const converted = await convertToModelMessages(messages);

    // Append the summarize instruction as a final user message
    const modelMessages = [
      ...converted,
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: SUMMARIZE_INSTRUCTION }],
      },
    ];

    const result = await generateWithRetries(
      model,
      system,
      modelMessages,
      elapsed,
    );

    if (!result.text.trim()) {
      logWarn("/api/summarize: still empty after retries");
      return Response.json(
        {
          error:
            "Provider returned empty response after retry. Please try again.",
        },
        { status: 502 },
      );
    }

    return Response.json({
      storyState: result.text,
      complete: isStateComplete(result.text),
      finishReason: result.finishReason,
    });
  } catch (error) {
    logError("Summarize API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
