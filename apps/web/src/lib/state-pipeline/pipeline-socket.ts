/**
 * StatePipelineSocket adapter — the real implementation of the state pipeline.
 *
 * Wraps the single-pass hybrid LLM pipeline behind the StatePipelineSocket
 * interface so the route is a thin HTTP boundary and the pipeline logic is
 * independently testable and swappable.
 */

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
import { openrouter } from "@/lib/openrouter";
import type { ExtractedFact } from "@/lib/state-history";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";
import {
  parseMarkdownToStructured,
  structuredToMarkdown,
  reconcileLifecycleState,
} from "@/lib/story-state-model";
import {
  extractLifecycleActions,
  validateLifecycleActions,
  applyLifecycleVerdicts,
  type LifecycleRejection,
} from "./lifecycle-validation";

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
- "Who is present" means physically present in the current scene only
- If someone arrives, add them and emit character_enters
- If someone leaves, remove them and emit character_leaves

### Current Demeanor
- Re-evaluate each character's mood and energy based on recent events
- This section should reflect the characters' emotional state RIGHT NOW

### Open Threads
- REMOVE threads that have been resolved or are no longer relevant
- UPDATE threads whose nature has evolved
- ADD new unresolved plot hooks or tensions
- Every thread MUST have a resolution hint in parentheses before the date tag: (resolves when: concise condition) (added: YYYY-MM-DD)
- For NEW threads, think about what narrative outcome would close this thread and write that as the resolution hint
- For EXISTING threads missing a resolution hint, add one based on the thread's context
- Aim for 3-8 active threads maximum
- Preserve original dates for kept items, use today's date for new ones
- When REMOVING a resolved/stale thread, you MUST include a "thread_resolved" change entry with a specific rationale explaining what happened in the story to close it (e.g., "Amanda confessed her feelings in turn 12, resolving the romantic tension thread"). Generic rationales like "no longer relevant" are not acceptable.

### Hard Facts
- CRITICALLY review every existing fact for current relevance
- REMOVE facts that have been SUPERSEDED (e.g., "they are strangers" once they become friends; "interested in each other" once they start dating)
- UPDATE facts whose details have changed
- ADD new established facts
- Character biographical facts (name, age, occupation) rarely change — only update if the story explicitly changes them
- Relationship-status and situational facts MUST be updated or removed as the situation evolves
- Each fact must end with (added: YYYY-MM-DD)
- Aim for 10-20 hard facts maximum — prune aggressively
- When REMOVING a superseded fact, you MUST include a "hard_fact_superseded" change entry with a specific rationale explaining what new information replaced it (e.g., "Brian revealed he owns a tech company, superseding the assumption about his wealth"). Generic rationales like "Superseded during state update" are not acceptable.

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
      "type": "scene_change|relationship_shift|appearance_change|mood_change|new_thread|thread_resolved|thread_evolved|hard_fact|hard_fact_superseded|cast_change|character_enters|character_leaves",
      "detail": "concise one-line description",
      "sourceTurn": 0,
      "confidence": 0.9
    }
  ]
}

- "updatedState" must be the COMPLETE story state as a markdown string with all 7 sections.
- "changes" lists every modification you made, including removals. Use "hard_fact_superseded" for removed facts, "thread_resolved" for removed threads, and "thread_evolved" when one thread transforms into another.
- If nothing needs to change, return the current state unchanged and an empty changes array.
- sourceTurn is the approximate user-message count where the change originated.
- confidence is 0.0-1.0 for how certain you are.`;

const HARD_FACT_REVIEW_WINDOW = 12;
const THREAD_STALE_DAYS = 30;

function toDay(iso: string | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function includesSnippet(haystack: string, detail: string): boolean {
  const snippet = detail.trim().toLowerCase().slice(0, 28);
  return snippet.length > 0 && haystack.includes(snippet);
}

function applyLifecycleStage(
  previousState: string,
  candidateState: string,
  changes: ExtractedFact[],
  windowedMessages: readonly SocketMessage[],
  rejections?: readonly LifecycleRejection[],
): string {
  const previous = parseMarkdownToStructured(previousState);
  const parsed = parseMarkdownToStructured(candidateState);
  const state = reconcileLifecycleState(previous, parsed);

  const today = new Date().toISOString().slice(0, 10);
  const recentText = windowedMessages
    .map((m) => m.content.toLowerCase())
    .join("\n");
  const recentFacts = changes.slice(-HARD_FACT_REVIEW_WINDOW);

  const supersededChanges = changes.filter(
    (c) => c.type === "hard_fact_superseded",
  );

  state.hardFacts = state.hardFacts.map((fact) => {
    const confirmed =
      includesSnippet(recentText, fact.fact) ||
      recentFacts.some((f) =>
        includesSnippet(f.detail.toLowerCase(), fact.fact),
      );
    if (confirmed) {
      return {
        ...fact,
        lastConfirmedAt: today,
        superseded: false,
      };
    }
    if (fact.superseded) {
      const matchingChange = supersededChanges.find((c) =>
        includesSnippet(c.detail.toLowerCase(), fact.fact),
      );
      if (matchingChange) {
        return { ...fact, supersededBy: matchingChange.detail };
      }
    }
    return fact;
  });

  state.openThreads = state.openThreads.map((thread) => {
    const referenced = includesSnippet(recentText, thread.description);
    const resolvedChange = changes.find(
      (c) =>
        c.type === "thread_resolved" &&
        includesSnippet(c.detail.toLowerCase(), thread.description),
    );
    const evolved = changes.find(
      (c) =>
        c.type === "thread_evolved" &&
        includesSnippet(c.detail.toLowerCase(), thread.description),
    );
    const stale =
      !referenced &&
      !resolvedChange &&
      !evolved &&
      Date.now() - toDay(thread.lastReferencedAt ?? thread.createdAt) >
        THREAD_STALE_DAYS * 24 * 60 * 60 * 1000;

    return {
      ...thread,
      lastReferencedAt: referenced ? today : thread.lastReferencedAt,
      status: resolvedChange
        ? "resolved"
        : evolved
          ? "evolved"
          : stale
            ? "stale"
            : thread.status,
      closureRationale: resolvedChange
        ? resolvedChange.detail
        : stale
          ? `Thread stale -- not referenced in ${THREAD_STALE_DAYS}+ days`
          : thread.closureRationale,
      evolvedInto:
        evolved?.detail && evolved.detail.includes("->")
          ? evolved.detail.split("->")[1]?.trim() || thread.evolvedInto
          : thread.evolvedInto,
    };
  });

  // Stamp lifecycle rejection reasons onto threads/facts that were kept active
  if (rejections && rejections.length > 0) {
    for (const r of rejections) {
      if (r.kind === "thread_resolved") {
        const idx = state.openThreads.findIndex((t) =>
          includesSnippet(r.detail.toLowerCase(), t.description),
        );
        if (idx >= 0) {
          state.openThreads[idx] = {
            ...state.openThreads[idx]!,
            lifecycleRejection: r.reason,
          };
        }
      } else {
        const idx = state.hardFacts.findIndex((f) =>
          includesSnippet(r.detail.toLowerCase(), f.fact),
        );
        if (idx >= 0) {
          state.hardFacts[idx] = {
            ...state.hardFacts[idx]!,
            lifecycleRejection: r.reason,
          };
        }
      }
    }
  }

  return structuredToMarkdown(state);
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

interface LLMResult {
  updatedState: string;
  changes: ExtractedFact[];
}

interface AppPipelineRequest extends StatePipelineRequest {
  model?: string;
  staleSections?: readonly string[];
}

async function runLLMUpdate(
  model: string,
  providerOrder: readonly string[],
  messages: readonly SocketMessage[],
  currentState: string,
  staleSections?: readonly string[],
  retryFeedback?: string,
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
        content: [
          {
            type: "text" as const,
            text: `${STATE_UPDATE_INSTRUCTION}${buildFreshnessReviewHint(staleSections)}${retryFeedback ?? ""}`,
          },
        ],
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

function buildFreshnessReviewHint(staleSections?: readonly string[]): string {
  if (!staleSections || staleSections.length === 0) return "";
  return `\n\n## Section freshness review (required this pass)\nThese sections are stale and must be explicitly re-reviewed against recent turns:\n${staleSections
    .map((section) => `- ${section}`)
    .join("\n")}\nIf any listed section is outdated, update it now.`;
}

function buildRetryFeedback(validation: {
  schemaValid: boolean;
  outputComplete: boolean;
  noUnknownFacts: boolean;
  diffPercentage: number;
}): string {
  const failures: string[] = [];
  if (!validation.schemaValid) {
    failures.push("Your previous output missed one or more required sections.");
  }
  if (!validation.outputComplete) {
    failures.push("Your previous output appears truncated or incomplete.");
  }
  if (!validation.noUnknownFacts) {
    failures.push(
      "Your previous output added hard facts that were not grounded in extracted changes.",
    );
  }
  if (validation.diffPercentage > 50) {
    failures.push(
      `Your previous output changed too much of the state (${validation.diffPercentage}%). Preserve more unchanged content.`,
    );
  }
  if (failures.length === 0) return "";
  return `\n\nRetry feedback:\n${failures.map((failure) => `- ${failure}`).join("\n")}`;
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
      appRequest.staleSections,
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

    // Run lifecycle validation -- verify thread closures and fact
    // supersessions are justified before applying the lifecycle stage.
    let lifecycleRejections: LifecycleRejection[] = [];
    const lifecycleActions = extractLifecycleActions(changes);
    if (lifecycleActions.length > 0) {
      const verdicts = await validateLifecycleActions(
        lifecycleActions,
        windowed,
        request.currentStoryState,
        model,
      );
      const result = applyLifecycleVerdicts(changes, verdicts);
      changes = result.changes;
      lifecycleRejections = result.rejections;
    }

    updatedState = applyLifecycleStage(
      request.currentStoryState,
      updatedState,
      changes,
      windowed,
      lifecycleRejections,
    );

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
      const retryFeedback = buildRetryFeedback(validation);
      const retry = await runLLMUpdate(
        model,
        providerOrder,
        windowed,
        request.currentStoryState,
        appRequest.staleSections,
        retryFeedback,
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
