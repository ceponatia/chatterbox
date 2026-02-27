/**
 * StatePipelineSocket adapter — the real implementation of the state pipeline.
 *
 * Wraps the single-pass hybrid LLM pipeline behind the StatePipelineSocket
 * interface so the route is a thin HTTP boundary and the pipeline logic is
 * independently testable and swappable.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type {
  StatePipelineSocket,
  StatePipelineRequest,
  StatePipelineResult,
  StatePipelineDisposition,
  SocketMessage,
} from "@chatterbox/sockets";
import { validateState } from "./validation";
import { determineDisposition } from "./auto-accept";
import { computeCascadeResets } from "./cascade-triggers";
import {
  logReasoning,
  logResponse,
  logWarn,
  log,
  startTimer,
} from "@/lib/api-logger";
import { env, getBaseUrl } from "@/lib/env";
import type { ExtractedFact } from "@/lib/state-history";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";

// ---------------------------------------------------------------------------
// OpenRouter client
// ---------------------------------------------------------------------------

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": getBaseUrl(),
    "X-Title": "Chatterbox",
  },
});

// ---------------------------------------------------------------------------
// Message windowing
// ---------------------------------------------------------------------------

const OVERLAP_MESSAGES = 10;

/**
 * Trim messages to a window: messages since `lastPipelineTurn` plus overlap
 * for narrative context. Exported for unit testing.
 */
export function windowSocketMessages(
  messages: readonly SocketMessage[],
  lastPipelineTurn: number,
): readonly SocketMessage[] {
  if (lastPipelineTurn <= 0) {
    return messages.slice(-40);
  }

  let userCount = 0;
  let windowStartIdx = 0;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "user") userCount++;
    if (userCount > lastPipelineTurn) {
      windowStartIdx = i;
      break;
    }
  }

  const startIdx = Math.max(0, windowStartIdx - OVERLAP_MESSAGES);
  return messages.slice(startIdx);
}

// ---------------------------------------------------------------------------
// Single-pass prompt
// ---------------------------------------------------------------------------

const STATE_UPDATE_INSTRUCTION = `You are a story state editor for an ongoing roleplay. You will read the recent conversation messages and the current story state, then produce TWO things:

1. **Updated Story State** — a complete, corrected story state document
2. **Change Log** — a structured list of what changed and why

## Instructions for updating the story state

Review EVERY section of the current story state against what is happening in the conversation. For each section:

### Cast
- Update character descriptions to reflect development
- Add new characters that have appeared
- Update roles if they have changed

### Relationships
- Update dynamics that have shifted (strangers → friends, tension → trust, etc.)
- Remove relationship descriptions superseded by newer ones
- Add new relationships that have formed

### Characters
- This section uses nested headings: ### CharacterName > #### Appearance > - **key**: comma-separated values
- Update entries that have changed (clothing, hair, injuries, etc.)
- Preserve unchanged entries
- Add new appearance details introduced in conversation
- Keep the compact comma-separated format for appearance values

### Scene
- Overwrite to reflect the CURRENT location, who is present, and atmosphere
- This section should always match what is happening RIGHT NOW in the conversation

### Current Demeanor
- Re-evaluate each character's mood and energy based on recent events
- This section should reflect the characters' emotional state RIGHT NOW

### Open Threads
- REMOVE threads that have been resolved or are no longer relevant
- UPDATE threads whose nature has evolved
- ADD new unresolved plot hooks or tensions
- Aim for 3-8 active threads maximum
- Each thread must end with (added: YYYY-MM-DD) — preserve original dates for kept items, use today's date for new ones

### Hard Facts
- CRITICALLY review every existing fact for current relevance
- REMOVE facts that have been SUPERSEDED (e.g., "they are strangers" once they become friends; "interested in each other" once they start dating)
- UPDATE facts whose details have changed
- ADD new established facts
- Character biographical facts (name, age, occupation) rarely change — only update if the story explicitly changes them
- Relationship-status and situational facts MUST be updated or removed as the situation evolves
- Each fact must end with (added: YYYY-MM-DD)
- Aim for 10-20 hard facts maximum — prune aggressively

## Rules
- ALWAYS use full character names exactly as they appear in the Cast section (e.g., "Kaho Higashi" not "Kaho", "Nagato Jiro" not "Jiro"). This applies to ALL sections — Cast, Relationships, Characters, Demeanor, etc.
- Do NOT blindly preserve old content. If something is outdated, remove or update it.
- Do NOT invent information beyond what the conversation and existing state provide.
- Output ALL 7 sections even if some are unchanged.
- Keep the total story state under 1200 tokens.

## Output format

Output ONLY valid JSON with this exact structure:
{
  "updatedState": "## Cast\\n...\\n\\n## Relationships\\n...\\n\\n## Characters\\n\\n### CharName\\n\\n#### Appearance\\n\\n- **key**: values\\n...\\n\\n## Scene\\n...\\n\\n## Current Demeanor\\n...\\n\\n## Open Threads\\n...\\n\\n## Hard Facts\\n...",
  "changes": [
    {
      "type": "scene_change|relationship_shift|appearance_change|mood_change|new_thread|thread_resolved|hard_fact|hard_fact_superseded|cast_change",
      "detail": "concise one-line description",
      "sourceTurn": 0,
      "confidence": 0.9
    }
  ]
}

- "updatedState" must be the COMPLETE story state as a markdown string with all 7 sections.
- "changes" lists every modification you made, including removals. Use "hard_fact_superseded" for removed facts and "thread_resolved" for removed threads.
- If nothing needs to change, return the current state unchanged and an empty changes array.
- sourceTurn is the approximate user-message count where the change originated.
- confidence is 0.0-1.0 for how certain you are.`;

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

interface LLMResult {
  updatedState: string;
  changes: ExtractedFact[];
}

interface AppPipelineRequest extends StatePipelineRequest {
  model?: string;
}

async function runLLMUpdate(
  model: string,
  providerOrder: readonly string[],
  messages: readonly SocketMessage[],
  currentState: string,
): Promise<LLMResult> {
  const elapsed = startTimer();

  // SocketMessage maps directly to CoreMessage — role + string content.
  // System messages are excluded here; they're passed via the system param.
  const coreMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const result = await generateText({
    model: openrouter(model),
    system:
      "You are analyzing a roleplay conversation to update its story state." +
      "\n\nCurrent Story State:\n\n" +
      currentState,
    messages: [
      ...coreMessages,
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: STATE_UPDATE_INSTRUCTION }],
      },
    ],
    temperature: 0.15,
    maxOutputTokens: 3072,
    providerOptions: {
      openrouter: {
        reasoning: { effort: "high" as const },
        ...(providerOrder.length > 0
          ? { provider: { order: [...providerOrder] } }
          : {}),
      },
    },
  });

  logReasoning("/api/state-update", result.reasoningText);
  logResponse("/api/state-update", elapsed(), result.text);

  try {
    const cleaned = result.text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      updatedState?: string;
      changes?: ExtractedFact[];
    };
    return {
      updatedState: (parsed.updatedState ?? "").trim(),
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    };
  } catch {
    logWarn("/api/state-update: failed to parse LLM JSON, falling back");
    const text = result.text.trim();
    if (text.includes("## ")) {
      return { updatedState: text, changes: [] };
    }
    return { updatedState: "", changes: [] };
  }
}

// ---------------------------------------------------------------------------
// Pass-through validation result (used when LLM returns empty state)
// ---------------------------------------------------------------------------

const PASS_VALIDATION = {
  schemaValid: true,
  allHardFactsPreserved: true,
  noUnknownFacts: true,
  outputComplete: true,
  diffPercentage: 0,
} as const;

// ---------------------------------------------------------------------------
// Socket implementation
// ---------------------------------------------------------------------------

export const statePipelineAdapter: StatePipelineSocket = {
  async run(request: StatePipelineRequest): Promise<StatePipelineResult> {
    const appRequest = request as AppPipelineRequest;
    const windowed = windowSocketMessages(
      request.messages,
      request.lastPipelineTurn,
    );

    log(
      `  \x1b[2mstate-update: ${request.messages.length} msgs → ${windowed.length} windowed\x1b[0m`,
      "info",
    );

    const model = appRequest.model ?? DEFAULT_MODEL_ID;
    const providerOrder =
      getModelEntry(model)?.providers ??
      getModelEntry(DEFAULT_MODEL_ID)?.providers ??
      [];

    let { updatedState, changes } = await runLLMUpdate(
      model,
      providerOrder,
      windowed,
      request.currentStoryState,
    );

    if (!updatedState) {
      return {
        newState: request.currentStoryState,
        changes,
        validation: PASS_VALIDATION,
        disposition: "auto_accepted" as StatePipelineDisposition,
        cascadeResets: computeCascadeResets(changes),
        turnNumber: request.turnNumber,
      };
    }

    let validation = validateState(
      updatedState,
      request.currentStoryState,
      changes,
    );
    let disposition = determineDisposition(
      validation,
    ) as StatePipelineDisposition;

    if (disposition === "retried") {
      logWarn("/api/state-update: validation failed, retrying…");
      const retry = await runLLMUpdate(
        model,
        providerOrder,
        windowed,
        request.currentStoryState,
      );
      if (retry.updatedState) {
        updatedState = retry.updatedState;
        changes = retry.changes;
        validation = validateState(
          updatedState,
          request.currentStoryState,
          changes,
        );
        disposition = determineDisposition(
          validation,
        ) as StatePipelineDisposition;
      }
      if (disposition === "retried") disposition = "flagged";
    }

    const cascadeResets = computeCascadeResets(changes);
    log(
      `  \x1b[2m✅ state-update: ${disposition}, diff ${validation.diffPercentage}%, ` +
        `${changes.length} changes` +
        (cascadeResets.length > 0
          ? `, cascade: ${cascadeResets.join(", ")}`
          : "") +
        `\x1b[0m`,
      "info",
    );

    return {
      newState: updatedState,
      changes,
      validation,
      disposition,
      cascadeResets,
      turnNumber: request.turnNumber,
    };
  },
};
