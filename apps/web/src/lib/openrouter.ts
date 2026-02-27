import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env, getBaseUrl } from "@/lib/env";

const sharedConfig = {
  apiKey: env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": getBaseUrl(),
    "X-Title": "Chatterbox",
  },
  extraBody: {
    zdr: false,
  },
} as const;

export const openrouter = createOpenRouter(sharedConfig);

// ---------------------------------------------------------------------------
// Plain-text provider variant (Aion, etc.)
//
// The OpenRouter AI SDK provider always wraps system-message content in an
// array (`[{type:"text", text:"..."}]`).  Providers like AionLabs reject
// that format and expect plain strings.  This instance injects a custom
// `fetch` that flattens single-element content arrays back to strings before
// the request leaves the process.
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: string;
  content: unknown;
}

function flattenContentArrays(body: Record<string, unknown>): void {
  const messages = body.messages;
  if (!Array.isArray(messages)) return;

  for (const msg of messages as ChatMessage[]) {
    const c = msg.content;
    if (!Array.isArray(c)) continue;
    if (
      c.length === 1 &&
      typeof c[0] === "object" &&
      c[0] !== null &&
      (c[0] as Record<string, unknown>).type === "text" &&
      typeof (c[0] as Record<string, unknown>).text === "string"
    ) {
      msg.content = (c[0] as Record<string, unknown>).text;
    }
  }
}

const plainTextFetch: typeof globalThis.fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      flattenContentArrays(parsed);
      init = { ...init, body: JSON.stringify(parsed) };
    } catch {
      // not JSON -- pass through unchanged
    }
  }
  return globalThis.fetch(input, init);
};

export const openrouterPlainText = createOpenRouter({
  ...sharedConfig,
  fetch: plainTextFetch,
});
