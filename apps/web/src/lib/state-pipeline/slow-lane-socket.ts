/**
 * Slow-lane reconciliation pipeline implementation.
 *
 * Implements SlowLaneReconciliationSocket by calling an LLM to review
 * candidate facts and make durable decisions about state updates.
 */

import { generateText } from "ai";
import type {
  SlowLaneReconciliationSocket,
  SlowLaneRequest,
  SlowLaneResult,
  CandidateFactDecision,
  CandidateVerdict,
  SupersessionUpdate,
  ThreadReconciliation,
  ThreadReconciliationAction,
} from "@chatterbox/sockets";
import {
  parseMarkdownToStructured,
  structuredToMarkdown,
} from "@chatterbox/state-model";
import { openrouter } from "@/lib/openrouter";
import { env } from "@/lib/env";
import { log, logWarn, logError, startTimer } from "@/lib/api-logger";
import { SLOW_LANE_INSTRUCTION } from "./slow-lane-prompt";

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface RawSlowLaneResponse {
  candidateDecisions?: Array<{
    candidateId?: string;
    verdict?: string;
    detail?: string;
  }>;
  supersessions?: Array<{
    existingFactSnippet?: string;
    supersededBy?: string;
  }>;
  threadReconciliations?: Array<{
    threadSnippet?: string;
    action?: string;
    rationale?: string;
  }>;
  summary?: string;
}

const VALID_VERDICTS = new Set<CandidateVerdict>([
  "promoted",
  "rejected",
  "retained",
]);
const VALID_THREAD_ACTIONS = new Set<ThreadReconciliationAction>([
  "resolve",
  "archive",
  "retain",
]);

function parseSlowLaneResponse(text: string): RawSlowLaneResponse | null {
  // Strip markdown fencing if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    const lastFence = cleaned.lastIndexOf("```");
    if (firstNewline !== -1 && lastFence > firstNewline) {
      cleaned = cleaned.slice(firstNewline + 1, lastFence).trim();
    }
  }

  try {
    return JSON.parse(cleaned) as RawSlowLaneResponse;
  } catch {
    logWarn("slow-lane: failed to parse LLM response as JSON");
    return null;
  }
}

function normalizeDecisions(
  raw: RawSlowLaneResponse,
  candidateIds: ReadonlySet<string>,
): CandidateFactDecision[] {
  const decisions: CandidateFactDecision[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw.candidateDecisions)) {
    for (const d of raw.candidateDecisions) {
      const id = d.candidateId ?? "";
      const verdict = (d.verdict ?? "retained") as CandidateVerdict;
      if (id && candidateIds.has(id) && !seen.has(id)) {
        seen.add(id);
        decisions.push({
          candidateId: id,
          verdict: VALID_VERDICTS.has(verdict) ? verdict : "retained",
          detail: d.detail ?? "",
        });
      }
    }
  }

  // Any candidate not in the response defaults to retained
  for (const id of candidateIds) {
    if (!seen.has(id)) {
      decisions.push({
        candidateId: id,
        verdict: "retained",
        detail: "",
      });
    }
  }

  return decisions;
}

function normalizeSupersessions(
  raw: RawSlowLaneResponse,
): SupersessionUpdate[] {
  if (!Array.isArray(raw.supersessions)) return [];
  const out: SupersessionUpdate[] = [];
  for (const s of raw.supersessions) {
    if (s.existingFactSnippet && s.supersededBy) {
      out.push({
        existingFactSnippet: s.existingFactSnippet,
        supersededBy: s.supersededBy,
      });
    }
  }
  return out;
}

function normalizeThreadReconciliations(
  raw: RawSlowLaneResponse,
): ThreadReconciliation[] {
  if (!Array.isArray(raw.threadReconciliations)) return [];
  const out: ThreadReconciliation[] = [];
  for (const t of raw.threadReconciliations) {
    if (t.threadSnippet) {
      const action = (t.action ?? "retain") as ThreadReconciliationAction;
      out.push({
        threadSnippet: t.threadSnippet,
        action: VALID_THREAD_ACTIONS.has(action) ? action : "retain",
        rationale: t.rationale ?? "",
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// State application
// ---------------------------------------------------------------------------

function applyPromotedFacts(
  stateMarkdown: string,
  decisions: readonly CandidateFactDecision[],
): string {
  const promoted = decisions.filter((d) => d.verdict === "promoted");
  if (promoted.length === 0) return stateMarkdown;

  // Parse, add promoted facts to hardFacts, re-serialize
  const structured = parseMarkdownToStructured(stateMarkdown);
  for (const p of promoted) {
    if (p.detail) {
      structured.hardFacts.push({
        fact: p.detail,
        superseded: false,
        tags: [],
        establishedAt: new Date().toISOString().slice(0, 10),
      });
    }
  }
  return structuredToMarkdown(structured);
}

// ---------------------------------------------------------------------------
// Pipeline implementation
// ---------------------------------------------------------------------------

export const slowLaneReconciliationAdapter: SlowLaneReconciliationSocket = {
  async reconcile(request: SlowLaneRequest): Promise<SlowLaneResult> {
    const timer = startTimer();

    if (request.candidateFacts.length === 0) {
      log("slow-lane: no candidates to reconcile, returning no-op");
      return {
        candidateDecisions: [],
        supersessions: [],
        threadReconciliations: [],
        updatedState: request.currentStoryState,
        summary: "No candidate facts to reconcile.",
      };
    }

    const candidateIds = new Set(request.candidateFacts.map((cf) => cf.id));

    // Build user prompt with candidates
    const candidateList = request.candidateFacts
      .map(
        (cf) =>
          `- [${cf.id}] (confidence: ${cf.confidence.toFixed(2)}) ${cf.content}`,
      )
      .join("\n");

    const userPrompt = [
      "## Current Story State\n",
      request.currentStoryState,
      "\n## Candidate Facts\n",
      candidateList,
      request.recentContext
        ? `\n## Recent Context\n\n${request.recentContext}`
        : "",
    ].join("\n");

    try {
      const { text, reasoning } = await generateText({
        model: openrouter(env.SLOW_LANE_MODEL),
        system: SLOW_LANE_INSTRUCTION,
        prompt: userPrompt,
        temperature: 0.3,
      });

      if (reasoning) {
        log(`slow-lane reasoning: ${reasoning.slice(0, 200)}...`);
      }

      const elapsed = timer();
      log(`slow-lane: LLM call completed in ${elapsed}ms`);

      const raw = parseSlowLaneResponse(text);
      if (!raw) {
        logWarn("slow-lane: LLM returned unparseable response, retaining all");
        return {
          candidateDecisions: request.candidateFacts.map((cf) => ({
            candidateId: cf.id,
            verdict: "retained" as const,
            detail: "LLM response was not parseable",
          })),
          supersessions: [],
          threadReconciliations: [],
          updatedState: request.currentStoryState,
          summary: "Reconciliation failed -- LLM response was not parseable.",
        };
      }

      const candidateDecisions = normalizeDecisions(raw, candidateIds);
      const supersessions = normalizeSupersessions(raw);
      const threadReconciliations = normalizeThreadReconciliations(raw);
      const summary = raw.summary ?? "Reconciliation completed.";

      // Apply promoted facts to the state
      const updatedState = applyPromotedFacts(
        request.currentStoryState,
        candidateDecisions,
      );

      const promotedCount = candidateDecisions.filter(
        (d) => d.verdict === "promoted",
      ).length;
      const rejectedCount = candidateDecisions.filter(
        (d) => d.verdict === "rejected",
      ).length;
      const retainedCount = candidateDecisions.filter(
        (d) => d.verdict === "retained",
      ).length;

      log(
        `slow-lane: ${promotedCount} promoted, ${rejectedCount} rejected, ${retainedCount} retained, ${supersessions.length} supersessions, ${threadReconciliations.length} thread changes`,
      );

      return {
        candidateDecisions,
        supersessions,
        threadReconciliations,
        updatedState,
        summary,
      };
    } catch (err) {
      logError("slow-lane: reconciliation failed", err);
      return {
        candidateDecisions: request.candidateFacts.map((cf) => ({
          candidateId: cf.id,
          verdict: "retained" as const,
          detail: "Reconciliation error -- retained for safety",
        })),
        supersessions: [],
        threadReconciliations: [],
        updatedState: request.currentStoryState,
        summary: `Reconciliation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  },
};
