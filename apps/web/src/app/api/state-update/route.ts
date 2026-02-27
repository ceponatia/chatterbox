/**
 * /api/state-update — Multi-stage state pipeline.
 *
 * Stage 1: Fact extraction (LLM) — extract new facts from recent messages
 * Stage 2: State merge (LLM) — patch existing state with extracted facts
 * Stage 3: Validation (deterministic) — schema, preservation, novelty, completeness
 * Stage 4: Auto-accept (deterministic) — disposition based on validation
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, UIMessage, convertToModelMessages } from "ai";
import { logRequest, startTimer, logResponse, logReasoning } from "@/lib/api-logger";
import { validateState } from "@/lib/state-pipeline/validation";
import { determineDisposition } from "@/lib/state-pipeline/auto-accept";
import type { ExtractedFact } from "@/lib/state-history";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Chatterbox",
  },
});

const PROVIDER_OPTIONS = {
  openrouter: {
    reasoning: { effort: "low" as const },
    provider: { order: ["Phala", "NovitaAI", "Z.ai"] },
  },
};

// ---------------------------------------------------------------------------
// Stage 1: Fact Extraction
// ---------------------------------------------------------------------------

const FACT_EXTRACTION_INSTRUCTION = `You are a fact extractor. Read the recent messages and extract ONLY new facts as a JSON array.

Each fact must have:
- "type": one of "scene_change", "relationship_shift", "appearance_change", "mood_change", "new_thread", "thread_resolved", "hard_fact", "cast_change"
- "detail": a concise one-line description of the fact
- "sourceTurn": the turn number (count of user messages) where this fact was established
- "confidence": 0.0 to 1.0 — how certain you are this fact was explicitly stated (not inferred)

Rules:
- Only extract facts directly stated or clearly demonstrated in the messages.
- Do NOT infer motivations, predict future events, or speculate about off-screen happenings.
- If something is ambiguous, do not extract it.
- Do NOT repeat facts already captured in the Current Story State.
- Output ONLY valid JSON: { "facts": [...] }
- If there are no new facts, output: { "facts": [] }`;

async function extractFacts(
  model: string,
  messages: UIMessage[],
  currentState: string,
): Promise<ExtractedFact[]> {
  const elapsed = startTimer();
  const converted = await convertToModelMessages(messages);

  const result = await generateText({
    model: openrouter(model),
    system: `You are analyzing a roleplay conversation. Here is the current story state:\n\n${currentState}`,
    messages: [
      ...converted,
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: FACT_EXTRACTION_INSTRUCTION }],
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 1024,
    providerOptions: PROVIDER_OPTIONS,
  });

  logReasoning("/api/state-update [extract]", result.reasoningText);
  logResponse("/api/state-update [extract]", elapsed(), result.text);

  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { facts: ExtractedFact[] };
    return Array.isArray(parsed.facts) ? parsed.facts : [];
  } catch {
    console.warn("\x1b[33m⚠ /api/state-update: failed to parse fact extraction JSON\x1b[0m");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Stage 2: State Merge
// ---------------------------------------------------------------------------

const MERGE_INSTRUCTION = `You are a story state editor. Merge the extracted facts into the existing story state.

Rules:
- Preserve ALL existing content unless a fact explicitly supersedes it.
- Scene changes overwrite the Scene section.
- New characters are appended to Cast.
- New hard facts are appended to Hard Facts.
- Appearance changes update the Appearance section.
- Relationship shifts update the Relationships section.
- Mood changes update Current Demeanor.
- New threads are added to Open Threads. Resolved threads are removed.
- Do NOT invent any information beyond what the facts provide.
- Do NOT remove any hard facts unless explicitly contradicted.
- Output ONLY the complete updated Story State block with all 7 sections.
- Keep it under 1200 tokens.`;

async function mergeState(
  model: string,
  currentState: string,
  facts: ExtractedFact[],
): Promise<string> {
  if (facts.length === 0) return currentState;

  const elapsed = startTimer();
  const factsText = facts
    .map(f => `- [${f.type}] ${f.detail} (turn ${f.sourceTurn}, confidence ${f.confidence})`)
    .join("\n");

  const result = await generateText({
    model: openrouter(model),
    system: `You are editing a story state document. Here is the current state:\n\n${currentState}`,
    messages: [
      {
        role: "user" as const,
        content: [{
          type: "text" as const,
          text: `${MERGE_INSTRUCTION}\n\n## Extracted Facts\n${factsText}`,
        }],
      },
    ],
    temperature: 0.3,
    maxOutputTokens: 2048,
    providerOptions: PROVIDER_OPTIONS,
  });

  logReasoning("/api/state-update [merge]", result.reasoningText);
  logResponse("/api/state-update [merge]", elapsed(), result.text);

  return result.text.trim() || currentState;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const { messages, currentStoryState, turnNumber } = (await req.json()) as {
      messages: UIMessage[];
      currentStoryState: string;
      turnNumber: number;
    };

    logRequest("/api/state-update", { turnNumber, messageCount: messages.length });
    const model = process.env.OPENROUTER_MODEL || "z-ai/glm-5";

    // Stage 1: Extract facts
    const facts = await extractFacts(model, messages, currentStoryState);
    console.log(`  \x1b[2m📋 extracted ${facts.length} facts\x1b[0m`);

    if (facts.length === 0) {
      return Response.json({
        newState: currentStoryState,
        extractedFacts: [],
        validation: {
          schemaValid: true,
          allHardFactsPreserved: true,
          noUnknownFacts: true,
          outputComplete: true,
          diffPercentage: 0,
        },
        disposition: "auto_accepted",
        turnNumber,
      });
    }

    // Stage 2: Merge facts into state
    let candidateState = await mergeState(model, currentStoryState, facts);

    // Stage 3: Validate
    let validation = validateState(candidateState, currentStoryState, facts);

    // Stage 4: Auto-accept / flag / retry
    let disposition = determineDisposition(validation);

    // If retried, try merge once more
    if (disposition === "retried") {
      console.warn("\x1b[33m⚠ /api/state-update: validation failed, retrying merge…\x1b[0m");
      candidateState = await mergeState(model, currentStoryState, facts);
      validation = validateState(candidateState, currentStoryState, facts);
      disposition = determineDisposition(validation);
      // If still failing, flag instead of rejecting entirely
      if (disposition === "retried") disposition = "flagged";
    }

    console.log(`  \x1b[2m✅ state-update: ${disposition}, diff ${validation.diffPercentage}%, ${facts.length} facts\x1b[0m`);

    return Response.json({
      newState: candidateState,
      extractedFacts: facts,
      validation,
      disposition,
      turnNumber,
    });
  } catch (error) {
    console.error("State update API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
