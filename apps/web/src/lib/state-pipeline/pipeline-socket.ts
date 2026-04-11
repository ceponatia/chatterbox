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
  StatePipelineValidation,
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
import type { StatePipelineChange, CandidateFact } from "@chatterbox/sockets";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";
import {
  parseMarkdownToStructured,
  structuredToMarkdown,
  reconcileLifecycleState,
  type StructuredStoryState,
} from "@chatterbox/state-model";
import {
  extractLifecycleActions,
  validateLifecycleActions,
  applyLifecycleVerdicts,
  type LifecycleRejection,
} from "./lifecycle-validation";
import { STATE_UPDATE_INSTRUCTION } from "./pipeline-prompt";

// ---------------------------------------------------------------------------
// Candidate fact splitting
// ---------------------------------------------------------------------------

const CANDIDATE_CONFIDENCE_THRESHOLD = 0.6;
const FACT_CHANGE_TYPES = new Set([
  "hard_fact",
  "hard_fact_new",
  "hard_fact_superseded",
  "hard_fact_correction",
  "new_hard_fact",
]);

function splitCandidateFacts(
  changes: StatePipelineChange[],
  messages: readonly SocketMessage[],
): { confirmed: StatePipelineChange[]; candidates: CandidateFact[] } {
  const confirmed: StatePipelineChange[] = [];
  const candidates: CandidateFact[] = [];
  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1]!.id : "unknown";
  const now = new Date().toISOString().slice(0, 10);

  for (const change of changes) {
    const isFact =
      FACT_CHANGE_TYPES.has(change.type) || change.type.includes("fact");
    if (isFact && change.confidence < CANDIDATE_CONFIDENCE_THRESHOLD) {
      candidates.push({
        id: `cf-${Date.now()}-${candidates.length}`,
        content: change.detail,
        confidence: change.confidence,
        sourceMessageId: lastMessageId,
        extractedAt: now,
      });
    } else {
      confirmed.push(change);
    }
  }

  return { confirmed, candidates };
}

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
  let windowStartIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "user") userCount++;
    if (userCount > lastPipelineTurn) {
      windowStartIdx = i;
      break;
    }
  }

  // No new messages beyond lastPipelineTurn (re-run or equal turn range) --
  // fall back to a capped recent window instead of sending everything.
  if (windowStartIdx < 0) {
    return messages.slice(-40);
  }

  const startIdx = Math.max(0, windowStartIdx - OVERLAP_MESSAGES);
  return messages.slice(startIdx);
}

// ---------------------------------------------------------------------------
// Lifecycle constants and helpers
// ---------------------------------------------------------------------------

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

function processFactLifecycle(
  state: StructuredStoryState,
  supersededChanges: StatePipelineChange[],
  recentText: string,
  recentFacts: StatePipelineChange[],
  today: string,
): void {
  state.hardFacts = state.hardFacts.map((fact) => {
    const confirmed =
      includesSnippet(recentText, fact.fact) ||
      recentFacts.some((f) =>
        includesSnippet(f.detail.toLowerCase(), fact.fact),
      );
    if (confirmed) {
      return { ...fact, lastConfirmedAt: today, superseded: false };
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
}

function isThreadStale(
  thread: StructuredStoryState["openThreads"][number],
  referenced: boolean,
  resolvedChange: StatePipelineChange | undefined,
  evolved: StatePipelineChange | undefined,
): boolean {
  if (referenced || resolvedChange || evolved) return false;
  const lastRef = toDay(thread.lastReferencedAt ?? thread.createdAt);
  return Date.now() - lastRef > THREAD_STALE_DAYS * 24 * 60 * 60 * 1000;
}

function resolveThreadUpdate(
  thread: StructuredStoryState["openThreads"][number],
  changes: StatePipelineChange[],
  recentText: string,
  today: string,
): StructuredStoryState["openThreads"][number] {
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
  const stale = isThreadStale(thread, referenced, resolvedChange, evolved);

  let status = thread.status;
  if (resolvedChange) status = "resolved";
  else if (evolved) status = "evolved";
  else if (stale) status = "stale";

  let closureRationale = thread.closureRationale;
  if (resolvedChange) closureRationale = resolvedChange.detail;
  else if (stale)
    closureRationale = `Thread stale -- not referenced in ${THREAD_STALE_DAYS}+ days`;

  const evolvedInto =
    evolved?.detail && evolved.detail.includes("->")
      ? evolved.detail.split("->")[1]?.trim() || thread.evolvedInto
      : thread.evolvedInto;

  return {
    ...thread,
    lastReferencedAt: referenced ? today : thread.lastReferencedAt,
    status,
    closureRationale,
    evolvedInto,
  };
}

function stampLifecycleRejections(
  state: StructuredStoryState,
  rejections: readonly LifecycleRejection[],
): void {
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

function applyLifecycleStage(
  previousState: string,
  candidateState: string,
  changes: StatePipelineChange[],
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

  processFactLifecycle(
    state,
    supersededChanges,
    recentText,
    recentFacts,
    today,
  );

  state.openThreads = state.openThreads.map((thread) =>
    resolveThreadUpdate(thread, changes, recentText, today),
  );

  if (rejections && rejections.length > 0) {
    stampLifecycleRejections(state, rejections);
  }

  return structuredToMarkdown(state);
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

interface LLMResult {
  updatedState: string;
  changes: StatePipelineChange[];
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
      changes?: StatePipelineChange[];
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
// Socket helpers
// ---------------------------------------------------------------------------

function resolveModelAndProviders(appRequest: AppPipelineRequest): {
  model: string;
  providerOrder: readonly string[];
} {
  const requestedModel = appRequest.model ?? DEFAULT_MODEL_ID;
  const model =
    requestedModel === "aion-labs/aion-2.0" ? DEFAULT_MODEL_ID : requestedModel;
  if (model !== requestedModel) {
    log(
      `  \x1b[2mstate-update: model fallback ${requestedModel} -> ${model}\x1b[0m`,
      "info",
    );
  }
  const providerOrder =
    getModelEntry(model)?.providers ??
    getModelEntry(DEFAULT_MODEL_ID)?.providers ??
    [];
  return { model, providerOrder };
}

async function executeRetryPass(
  model: string,
  providerOrder: readonly string[],
  windowed: readonly SocketMessage[],
  currentState: string,
  staleSections: readonly string[] | undefined,
  currentValidation: StatePipelineValidation,
): Promise<{
  updatedState: string;
  changes: StatePipelineChange[];
  validation: StatePipelineValidation;
  disposition: StatePipelineDisposition;
} | null> {
  logWarn("/api/state-update: validation failed, retrying\u2026");
  const retryFeedback = buildRetryFeedback(currentValidation);
  const retry = await runLLMUpdate(
    model,
    providerOrder,
    windowed,
    currentState,
    staleSections,
    retryFeedback,
  );
  if (!retry.updatedState) return null;
  const validation = validateState(
    retry.updatedState,
    currentState,
    retry.changes,
  );
  let disposition = determineDisposition(validation);
  if (disposition === "retried") disposition = "flagged";
  return {
    updatedState: retry.updatedState,
    changes: retry.changes,
    validation,
    disposition,
  };
}

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
      `  \x1b[2mstate-update: ${request.messages.length} msgs \u2192 ${windowed.length} windowed\x1b[0m`,
      "info",
    );

    const { model, providerOrder } = resolveModelAndProviders(appRequest);

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
        candidateFacts: [],
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
    let disposition = determineDisposition(validation);

    if (disposition === "retried") {
      const retryResult = await executeRetryPass(
        model,
        providerOrder,
        windowed,
        request.currentStoryState,
        appRequest.staleSections,
        validation,
      );
      if (retryResult) {
        updatedState = retryResult.updatedState;
        changes = retryResult.changes;
        validation = retryResult.validation;
        disposition = retryResult.disposition;
      } else {
        disposition = "flagged";
      }
    }

    const { confirmed, candidates } = splitCandidateFacts(changes, windowed);
    const cascadeResets = computeCascadeResets(confirmed);
    log(
      `  \x1b[2m\u2705 state-update: ${disposition}, diff ${validation.diffPercentage}%, ` +
        `${confirmed.length} changes, ${candidates.length} candidates` +
        (cascadeResets.length > 0
          ? `, cascade: ${cascadeResets.join(", ")}`
          : "") +
        `\x1b[0m`,
      "info",
    );

    return {
      newState: updatedState,
      changes: confirmed,
      validation,
      disposition,
      cascadeResets,
      turnNumber: request.turnNumber,
      candidateFacts: candidates,
    };
  },
};
