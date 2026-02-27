const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
}

function truncate(str: string, max = 300): string {
  return str.length > max ? str.slice(0, max) + `… [+${str.length - max} chars]` : str;
}

function formatMessages(msgs: unknown[]): string[] {
  const lines = [`  ${YELLOW}messages${RESET}: ${msgs.length} message(s)`];
  const last = msgs[msgs.length - 1] as Record<string, unknown> | undefined;
  if (!last) return lines;
  const role = (last.role as string) ?? "?";
  const parts = last.parts as { type: string; text?: string }[] | undefined;
  const text = typeof last.content === "string"
    ? last.content
    : parts?.find((p) => p.type === "text")?.text ?? "[non-text]";
  lines.push(`  ${DIM}  last (${role}): ${truncate(String(text), 120)}${RESET}`);
  return lines;
}

function formatEntry(key: string, value: unknown): string {
  if (typeof value === "string") return `  ${YELLOW}${key}${RESET}: ${truncate(value, 120)}`;
  return `  ${YELLOW}${key}${RESET}: ${truncate(JSON.stringify(value), 120)}`;
}

export function logRequest(route: string, body: Record<string, unknown>) {
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
  console.log(
    `${GREEN}◀ ${route}${RESET} ${MAGENTA}${elapsedMs}ms${RESET} ${DIM}${timestamp()}${RESET}`
  );
  console.log(`  ${DIM}${truncate(body, 500)}${RESET}\n`);
}

export function logStreamStart(route: string) {
  console.log(
    `${GREEN}◀ ${route}${RESET} ${DIM}stream started ${timestamp()}${RESET}`
  );
}

export function logStreamEnd(route: string, elapsedMs: number, charCount: number) {
  console.log(
    `${GREEN}◀ ${route}${RESET} ${MAGENTA}${elapsedMs}ms${RESET} ${DIM}streamed ~${charCount} chars ${timestamp()}${RESET}\n`
  );
}

export function logReasoning(route: string, reasoningText: string | undefined) {
  if (!reasoningText) return;
  console.log(
    `${BLUE}🧠 ${route} reasoning${RESET} ${DIM}(${reasoningText.length} chars)${RESET}`
  );
  console.log(`  ${DIM}${truncate(reasoningText, 800)}${RESET}`);
}
