import { log } from "@/lib/api-logger";

/**
 * Log a tool invocation for dev instrumentation.
 * Called by stream-telemetry callbacks when a tool call is detected.
 */
export function logToolCall(
  toolName: string,
  args: Record<string, unknown>,
  conversationId: string | null | undefined,
): void {
  const ts = new Date().toISOString();
  const argSummary = JSON.stringify(args).slice(0, 200);
  log(
    `  \x1b[2m\u{1f527} tool: ${toolName} | conv: ${conversationId ?? "none"} | args: ${argSummary} | ${ts}\x1b[0m`,
    "info",
  );
}