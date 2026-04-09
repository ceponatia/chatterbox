import type { ModelMessage } from "ai";
import { log, logWarn } from "@/lib/api-logger";
import type {
  AssemblyContext,
  AssemblyResult,
} from "@chatterbox/prompt-assembly";
import { VERBATIM_TIER_SIZE } from "./history-compression";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export interface ChatSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tokenBudget?: number;
}

export const AION_NO_TOOL_USE_MODEL_ID = "aion-labs/aion-2.0";

export const SETTING_DEFAULTS = {
  temperature: 0.85,
  maxTokens: 1024,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

export function resolveSettings(s: ChatSettings) {
  const merged = { ...SETTING_DEFAULTS, ...s };
  return {
    temperature: merged.temperature,
    maxOutputTokens: merged.maxTokens,
    topP: merged.topP,
    frequencyPenalty: merged.frequencyPenalty,
    presencePenalty: merged.presencePenalty,
  };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export function logAssembly(assembly: AssemblyResult, ctx: AssemblyContext) {
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
    `  \x1b[2m\u{1f9e9} assembly t${ctx.turnNumber}: ` +
      `${assembly.included.length} included, ${assembly.omitted.length} omitted, ` +
      `~${assembly.tokenEstimate}/${ctx.tokenBudget} tokens (${budgetPct}%)` +
      (reasonSummary ? ` | omit: ${reasonSummary}` : "") +
      `\x1b[0m`,
    "info",
  );
}

export function logCompression(stats: {
  total: number;
  verbatim: number;
  summary: number;
  digest: number;
  promotedToVerbatim: number;
  promotedToSummary: number;
}) {
  if (stats.total <= VERBATIM_TIER_SIZE) return;
  log(
    `  \x1b[2m\u{1f5dc} history: total=${stats.total}, verbatim=${stats.verbatim}, summary=${stats.summary}, digest=${stats.digest}, promotions(v=${stats.promotedToVerbatim}, s=${stats.promotedToSummary})\x1b[0m`,
    "info",
  );
}

// ---------------------------------------------------------------------------
// Orphaned tool-call sanitization (operates on ModelMessage[])
// ---------------------------------------------------------------------------

export function stripOrphanedModelToolCalls(
  messages: ModelMessage[],
): ModelMessage[] {
  const toolResultIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "tool") continue;
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (typeof part === "object" && part !== null && "toolCallId" in part) {
        toolResultIds.add(part.toolCallId);
      }
    }
  }

  let stripped = 0;
  const result = messages.map((msg) => {
    if (msg.role !== "assistant" || typeof msg.content === "string") return msg;
    const content = msg.content;
    const hasOrphan = content.some(
      (part) =>
        part.type === "tool-call" && !toolResultIds.has(part.toolCallId),
    );
    if (!hasOrphan) return msg;

    const cleanContent = content.filter((part) => {
      if (part.type === "tool-call" && !toolResultIds.has(part.toolCallId)) {
        stripped++;
        return false;
      }
      return true;
    });
    return { ...msg, content: cleanContent };
  });

  if (stripped > 0) {
    logWarn(
      `/api/chat: stripped ${stripped} orphaned tool-call(s) from model messages`,
    );
  }
  return result;
}
