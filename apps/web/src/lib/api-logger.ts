import { env } from "./env";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";

const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: string): boolean {
  const current = LOG_LEVELS[env.LOG_LEVEL] ?? 1;
  const target = LOG_LEVELS[level] ?? 1;
  return target >= current;
}

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    fractionalSecondDigits: 3,
  });
}

function truncate(str: string, max = 300): string {
  return str.length > max
    ? str.slice(0, max) + `… [+${str.length - max} chars]`
    : str;
}

function formatMessages(msgs: unknown[]): string[] {
  const lines = [`  ${YELLOW}messages${RESET}: ${msgs.length} message(s)`];
  const last = msgs[msgs.length - 1] as Record<string, unknown> | undefined;
  if (!last) return lines;
  const role = (last.role as string) ?? "?";
  const parts = last.parts as { type: string; text?: string }[] | undefined;
  const text =
    typeof last.content === "string"
      ? last.content
      : (parts?.find((p) => p.type === "text")?.text ?? "[non-text]");
  lines.push(
    `  ${DIM}  last (${role}): ${truncate(String(text), 120)}${RESET}`,
  );
  return lines;
}

function formatEntry(key: string, value: unknown): string {
  if (typeof value === "string")
    return `  ${YELLOW}${key}${RESET}: ${truncate(value, 120)}`;
  return `  ${YELLOW}${key}${RESET}: ${truncate(JSON.stringify(value), 120)}`;
}

export function logRequest(route: string, body: Record<string, unknown>) {
  if (!shouldLog("info")) return;
  console.log(`\n${CYAN}▶ ${route}${RESET} ${DIM}${timestamp()}${RESET}`);
  for (const [key, value] of Object.entries(body)) {
    if (key === "messages" && Array.isArray(value)) {
      formatMessages(value).forEach((l) => console.log(l));
    } else {
      console.log(formatEntry(key, value));
    }
  }
}

export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

export function logResponse(route: string, elapsedMs: number, body: string) {
  if (!shouldLog("info")) return;
  console.log(
    `${GREEN}◀ ${route}${RESET} ${MAGENTA}${elapsedMs}ms${RESET} ${DIM}${timestamp()}${RESET}`,
  );
  console.log(`  ${DIM}${truncate(body, 500)}${RESET}\n`);
}

export function logStreamStart(route: string) {
  if (!shouldLog("info")) return;
  console.log(
    `${GREEN}◀ ${route}${RESET} ${DIM}stream started ${timestamp()}${RESET}`,
  );
}

export function logStreamEnd(
  route: string,
  elapsedMs: number,
  charCount: number,
) {
  if (!shouldLog("info")) return;
  console.log(
    `${GREEN}◀ ${route}${RESET} ${MAGENTA}${elapsedMs}ms${RESET} ${DIM}streamed ~${charCount} chars ${timestamp()}${RESET}\n`,
  );
}

export function logReasoning(route: string, reasoningText: string | undefined) {
  if (!reasoningText || !shouldLog("debug")) return;
  console.log(
    `${BLUE}🧠 ${route} reasoning${RESET} ${DIM}(${reasoningText.length} chars)${RESET}`,
  );
  console.log(`  ${DIM}${truncate(reasoningText, 800)}${RESET}`);
}
/** Generic log that respects LOG_LEVEL */
export function log(message: string, level: string = "info") {
  if (shouldLog(level)) {
    console.log(message);
  }
}

export function logWarn(message: string, ...args: unknown[]) {
  if (shouldLog("warn")) {
    console.warn(`\x1b[33m⚠ ${message}\x1b[0m`, ...args);
  }
}

export function logError(message: string, ...args: unknown[]) {
  if (shouldLog("error")) {
    console.error(`\x1b[31m✗ ${message}\x1b[0m`, ...args);
  }
}
