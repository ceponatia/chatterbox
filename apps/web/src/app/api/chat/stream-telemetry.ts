import {
  logStreamEnd,
  logReasoning,
  log,
  logWarn,
  logError,
} from "@/lib/api-logger";
import { logToolCall } from "./tool-call-logger";

export interface ToolTelemetryMeta {
  route: string;
  modelId: string;
  turnNumber: number;
  conversationId?: string | null;
  compression: {
    windowedMessages: number;
    windowedChars: number;
    verbatimMessages: number;
    verbatimChars: number;
    summaryMessages: number;
    digestMessages: number;
    promotedToVerbatim: number;
    promotedToSummary: number;
    hasHistorySummary: boolean;
    historySummaryChars: number;
    depthNoteChars: number;
    effectiveContextChars: number;
    compressionRatio: number;
  };
}

interface ToolTelemetry {
  stepCount: number;
  toolCallCount: number;
  inputBytes: number;
  outputBytes: number;
  byTool: Map<string, number>;
}

function estimateJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function getToolName(toolCall: Record<string, unknown>): string {
  const fromToolName = toolCall.toolName;
  if (typeof fromToolName === "string" && fromToolName.length > 0) {
    return fromToolName;
  }
  const fromName = toolCall.name;
  if (typeof fromName === "string" && fromName.length > 0) {
    return fromName;
  }
  return "unknown_tool";
}

function getStepToolCalls(stepResult: unknown): Record<string, unknown>[] {
  if (!stepResult || typeof stepResult !== "object") return [];
  const step = stepResult as Record<string, unknown>;
  const staticCalls = Array.isArray(step.toolCalls)
    ? (step.toolCalls as unknown[])
    : [];
  const dynamicCalls = Array.isArray(step.dynamicToolCalls)
    ? (step.dynamicToolCalls as unknown[])
    : [];
  return [...staticCalls, ...dynamicCalls].filter(
    (toolCall): toolCall is Record<string, unknown> =>
      Boolean(toolCall) && typeof toolCall === "object",
  );
}

function getStepToolResults(stepResult: unknown): unknown[] {
  if (!stepResult || typeof stepResult !== "object") return [];
  const step = stepResult as Record<string, unknown>;

  const staticResults = Array.isArray(step.toolResults)
    ? (step.toolResults as unknown[])
    : [];
  const dynamicResults = Array.isArray(step.dynamicToolResults)
    ? (step.dynamicToolResults as unknown[])
    : [];
  return [...staticResults, ...dynamicResults];
}

function getToolArgs(toolCall: Record<string, unknown>): Record<string, unknown> {
  const args = toolCall.args;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  const input = toolCall.input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function collectToolTelemetry(telemetry: ToolTelemetry, stepResult: unknown) {
  if (!stepResult || typeof stepResult !== "object") return;
  telemetry.stepCount += 1;

  const calls = getStepToolCalls(stepResult);
  const results = getStepToolResults(stepResult);

  telemetry.toolCallCount += calls.length;
  for (const toolCall of calls) {
    const toolName = getToolName(toolCall);
    telemetry.byTool.set(toolName, (telemetry.byTool.get(toolName) ?? 0) + 1);
    telemetry.inputBytes += estimateJsonSize(toolCall);
  }
  for (const toolResult of results) {
    telemetry.outputBytes += estimateJsonSize(toolResult);
  }
}

function formatToolTelemetry(telemetry: ToolTelemetry): string {
  const tools = [...telemetry.byTool.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}(${count})`)
    .join(", ");
  return (
    `steps=${telemetry.stepCount}, calls=${telemetry.toolCallCount}, ` +
    `in~${telemetry.inputBytes}B, out~${telemetry.outputBytes}B` +
    (tools ? `, tools=${tools}` : "")
  );
}

export function streamCallbacks(
  elapsed: () => number,
  meta: ToolTelemetryMeta,
) {
  const telemetry: ToolTelemetry = {
    stepCount: 0,
    toolCallCount: 0,
    inputBytes: 0,
    outputBytes: 0,
    byTool: new Map(),
  };

  return {
    onError({ error }: { error: unknown }) {
      logError("/api/chat stream error:", error);
    },
    onStepFinish(stepResult: unknown) {
      collectToolTelemetry(telemetry, stepResult);
      for (const toolCall of getStepToolCalls(stepResult)) {
        logToolCall(
          getToolName(toolCall),
          getToolArgs(toolCall),
          meta.conversationId,
        );
      }
    },
    onFinish({
      text,
      reasoningText,
    }: {
      text: string;
      reasoningText?: string;
    }) {
      logReasoning("/api/chat", reasoningText);
      const elapsedMs = elapsed();
      logStreamEnd(meta.route, elapsedMs, text.length);
      if (telemetry.stepCount > 0) {
        log(
          `  \x1b[2m\u{1f6e0} tool telemetry: ${formatToolTelemetry(telemetry)}\x1b[0m`,
          "info",
        );
      }
      log(
        JSON.stringify({
          event: "chat_tool_telemetry",
          route: meta.route,
          modelId: meta.modelId,
          turnNumber: meta.turnNumber,
          conversationId: meta.conversationId ?? null,
          elapsedMs,
          textChars: text.length,
          stepCount: telemetry.stepCount,
          toolCallCount: telemetry.toolCallCount,
          inputBytesApprox: telemetry.inputBytes,
          outputBytesApprox: telemetry.outputBytes,
          usedTools: telemetry.toolCallCount > 0,
          perTool: Object.fromEntries(telemetry.byTool.entries()),
          compression: meta.compression,
        }),
        "info",
      );
      if (text.length === 0 && !reasoningText)
        logWarn("/api/chat: 0 chars returned");
    },
  };
}
