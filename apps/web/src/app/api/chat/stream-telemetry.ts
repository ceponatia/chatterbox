import {
  logStreamEnd,
  logReasoning,
  log,
  logWarn,
  logError,
} from "@/lib/api-logger";

export interface ToolTelemetryMeta {
  route: string;
  modelId: string;
  turnNumber: number;
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

function collectToolTelemetry(telemetry: ToolTelemetry, stepResult: unknown) {
  if (!stepResult || typeof stepResult !== "object") return;
  telemetry.stepCount += 1;

  const step = stepResult as Record<string, unknown>;
  const staticCalls = Array.isArray(step.toolCalls)
    ? (step.toolCalls as unknown[])
    : [];
  const dynamicCalls = Array.isArray(step.dynamicToolCalls)
    ? (step.dynamicToolCalls as unknown[])
    : [];
  const calls = [...staticCalls, ...dynamicCalls];

  const staticResults = Array.isArray(step.toolResults)
    ? (step.toolResults as unknown[])
    : [];
  const dynamicResults = Array.isArray(step.dynamicToolResults)
    ? (step.dynamicToolResults as unknown[])
    : [];
  const results = [...staticResults, ...dynamicResults];

  telemetry.toolCallCount += calls.length;
  for (const toolCall of calls) {
    if (!toolCall || typeof toolCall !== "object") continue;
    const record = toolCall as Record<string, unknown>;
    const toolName = getToolName(record);
    telemetry.byTool.set(toolName, (telemetry.byTool.get(toolName) ?? 0) + 1);
    telemetry.inputBytes += estimateJsonSize(record);
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
