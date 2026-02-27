/**
 * Parallel lifecycle validation -- verifies that thread closures and hard fact
 * supersessions are justified by the conversation and state context.
 *
 * Runs as a separate LLM call in parallel with the main state pipeline so the
 * user perceives no additional delay. Results are used to revert unjustified
 * removals before the final state is applied.
 */

import { generateText } from "ai";
import { openrouter } from "@/lib/openrouter";
import { log, logResponse, logWarn, startTimer } from "@/lib/api-logger";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";
import type { ExtractedFact } from "@/lib/state-history";
import type { SocketMessage } from "@chatterbox/sockets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LifecycleAction {
  kind: "thread_resolved" | "hard_fact_superseded";
  description: string;
  rationale: string;
}

export interface LifecycleVerdict {
  action: string;
  justified: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const VALIDATION_INSTRUCTION = `You are a quality-control reviewer for a roleplay story state system. You will be given:
1. Recent conversation messages
2. The current story state
3. A list of proposed removals (thread closures or hard fact supersessions) with their rationales

For EACH proposed removal, determine whether it is JUSTIFIED based on the conversation evidence.

A removal is justified if:
- The conversation clearly shows the thread was resolved or the fact was superseded
- The rationale accurately describes what happened
- There is concrete evidence in the recent messages supporting the change

A removal is NOT justified if:
- The rationale is vague or generic (e.g., "no longer relevant", "superseded during update")
- There is no clear conversation evidence for the change
- The thread/fact is still relevant based on recent messages

Output ONLY valid JSON:
{
  "verdicts": [
    {
      "action": "description of the removal being reviewed",
      "justified": true,
      "reason": "brief explanation of why this is or isn't justified"
    }
  ]
}`;

// ---------------------------------------------------------------------------
// Extract actions from changes
// ---------------------------------------------------------------------------

export function extractLifecycleActions(
  changes: ExtractedFact[],
): LifecycleAction[] {
  return changes
    .filter(
      (c) =>
        c.type === "thread_resolved" || c.type === "hard_fact_superseded",
    )
    .map((c) => ({
      kind: c.type as LifecycleAction["kind"],
      description: c.detail,
      rationale: c.detail,
    }));
}

// ---------------------------------------------------------------------------
// LLM validation call
// ---------------------------------------------------------------------------

export async function validateLifecycleActions(
  actions: LifecycleAction[],
  windowedMessages: readonly SocketMessage[],
  currentState: string,
  model?: string,
): Promise<LifecycleVerdict[]> {
  if (actions.length === 0) return [];

  const elapsed = startTimer();
  const modelId = model ?? DEFAULT_MODEL_ID;
  const providerOrder =
    getModelEntry(modelId)?.providers ??
    getModelEntry(DEFAULT_MODEL_ID)?.providers ??
    [];

  const actionList = actions
    .map(
      (a, i) =>
        `${i + 1}. [${a.kind}] ${a.description}\n   Rationale: ${a.rationale}`,
    )
    .join("\n");

  const coreMessages = windowedMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  try {
    const result = await generateText({
      model: openrouter(modelId),
      system:
        "You are reviewing proposed story state changes for accuracy.\n\n" +
        "Current Story State:\n\n" +
        currentState,
      messages: [
        ...coreMessages,
        {
          role: "user" as const,
          content: `${VALIDATION_INSTRUCTION}\n\nProposed removals to review:\n${actionList}`,
        },
      ],
      temperature: 0.1,
      maxOutputTokens: 1024,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "medium" as const },
          ...(providerOrder.length > 0
            ? { provider: { order: [...providerOrder] } }
            : {}),
        },
      },
    });

    logResponse("/api/state-update/lifecycle-check", elapsed(), result.text);

    const cleaned = result.text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      verdicts?: LifecycleVerdict[];
    };
    return Array.isArray(parsed.verdicts) ? parsed.verdicts : [];
  } catch (err) {
    logWarn(
      `/api/state-update/lifecycle-check: validation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Apply verdicts -- revert unjustified removals
// ---------------------------------------------------------------------------

export interface LifecycleRejection {
  /** The change detail that was rejected */
  detail: string;
  /** The kind of change (thread_resolved or hard_fact_superseded) */
  kind: "thread_resolved" | "hard_fact_superseded";
  /** The reviewer's reason for rejecting */
  reason: string;
}

export function applyLifecycleVerdicts(
  changes: ExtractedFact[],
  verdicts: LifecycleVerdict[],
): { changes: ExtractedFact[]; rejections: LifecycleRejection[] } {
  if (verdicts.length === 0) return { changes, rejections: [] };

  const rejectedMap = new Map<string, string>();
  for (const v of verdicts) {
    if (!v.justified) {
      rejectedMap.set(v.action.toLowerCase().trim(), v.reason);
    }
  }

  if (rejectedMap.size === 0) return { changes, rejections: [] };

  const rejections: LifecycleRejection[] = [];
  const filtered = changes.filter((c) => {
    if (
      c.type !== "thread_resolved" &&
      c.type !== "hard_fact_superseded"
    ) {
      return true;
    }
    const key = c.detail.toLowerCase().trim();
    for (const [rejected, reason] of rejectedMap) {
      if (key.includes(rejected.slice(0, 28)) || rejected.includes(key.slice(0, 28))) {
        rejections.push({
          detail: c.detail,
          kind: c.type as LifecycleRejection["kind"],
          reason,
        });
        return false;
      }
    }
    return true;
  });

  if (rejections.length > 0) {
    log(
      `  \x1b[33mlifecycle-check: reverted ${rejections.length} unjustified removal(s)\x1b[0m`,
      "info",
    );
  }

  return { changes: filtered, rejections };
}
