import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, UIMessage, convertToModelMessages } from "ai";
import { logRequest, startTimer, logResponse, logReasoning } from "@/lib/api-logger";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Chatterbox",
  },
});

const SUMMARIZE_INSTRUCTION = `Update the Story State for continuity. Keep it under 800 tokens. Use EXACTLY the following sections in this order:

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
- **Where/When**: current location and time of day.
- **Who is present**: list everyone in the scene.
- **Atmosphere**: emotional tone, sensory details (lighting, sounds, temperature).

## Current Demeanor
- **Each character's mood**: 2-3 adjectives summarizing their emotional state right now.
- **Energy between them**: one line on the interpersonal dynamic (tension, comfort, flirtation, etc.).

## Open Threads
- 3-8 bullets of unresolved narrative hooks, questions, or tensions.
- Drop threads that have been resolved. Add new ones that emerged.

## Hard Facts
- Canon facts that must not drift or be forgotten.
- Preserve ALL existing hard facts unless explicitly contradicted in the conversation.
- Add new facts established in conversation (confessions, reveals, decisions).

Important rules:
- Do not invent facts not established in the conversation or existing Story State.
- Keep {{ user }}'s cast entry as "[player character, do not narrate]".
- Preserve existing details in every section unless they changed — do not drop information.
- Output ONLY the updated Story State block, no commentary or preamble.`;

export async function POST(req: Request) {
  try {
    const { messages, currentStoryState, systemPrompt } = (await req.json()) as {
      messages: UIMessage[];
      currentStoryState: string;
      systemPrompt: string;
    };

    logRequest("/api/summarize", { messages, currentStoryState, systemPrompt });
    const elapsed = startTimer();

    const model = process.env.OPENROUTER_MODEL || "z-ai/glm-5";

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

    const generate = () =>
      generateText({
        model: openrouter(model),
        system,
        messages: modelMessages,
        temperature: 0.4,
        maxOutputTokens: 1024,
        providerOptions: {
          openrouter: {
            reasoning: { effort: "medium" },
            provider: { order: ["Phala", "NovitaAI", "Z.ai"] },
          },
        },
      });

    let result = await generate();
    logReasoning("/api/summarize", result.reasoningText);
    logResponse("/api/summarize", elapsed(), result.text);

    if (!result.text.trim()) {
      console.warn("\x1b[33m⚠ /api/summarize: empty response, retrying once…\x1b[0m");
      const retryElapsed = startTimer();
      result = await generate();
      logReasoning("/api/summarize (retry)", result.reasoningText);
      logResponse("/api/summarize (retry)", retryElapsed(), result.text);
    }

    if (!result.text.trim()) {
      console.warn("\x1b[33m⚠ /api/summarize: still empty after retry\x1b[0m");
      return Response.json(
        { error: "Provider returned empty response after retry. Please try again." },
        { status: 502 }
      );
    }

    return Response.json({ storyState: result.text });
  } catch (error) {
    console.error("Summarize API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
