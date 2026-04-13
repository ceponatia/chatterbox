import type { Page, Route } from "@playwright/test";
import { randomUUID } from "node:crypto";

interface MockChatOptions {
  content: string;
  stream?: boolean;
  chunkDelay?: number;
}

/**
 * Build a complete SSE body following the AI SDK v6 UIMessage stream protocol.
 * Chunk sequence: text-start -> text-delta(s) -> text-end -> finish
 */
function buildSSEBody(textChunks: string[]): string {
  const partId = randomUUID();
  let body = "";

  // text-start
  body += `data: ${JSON.stringify({ type: "text-start", id: partId })}\n\n`;

  // text-delta(s)
  for (const chunk of textChunks) {
    body += `data: ${JSON.stringify({ type: "text-delta", id: partId, delta: chunk })}\n\n`;
  }

  // text-end
  body += `data: ${JSON.stringify({ type: "text-end", id: partId })}\n\n`;

  // finish
  body += `data: ${JSON.stringify({
    type: "finish",
    finishReason: "stop",
    usage: { promptTokens: 0, completionTokens: 0 },
  })}\n\n`;

  return body;
}

export async function mockChatStream(
  page: Page,
  options: MockChatOptions,
): Promise<Route[]> {
  const captured: Route[] = [];

  await page.route("**/api/chat", async (route) => {
    captured.push(route);

    const { content, stream = true, chunkDelay } = options;

    if (chunkDelay) {
      await new Promise((resolve) => setTimeout(resolve, chunkDelay));
    }

    const chunks = stream ? splitIntoChunks(content, 3) : [content];

    try {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "x-vercel-ai-ui-message-stream": "v1",
          "cache-control": "no-cache",
        },
        body: buildSSEBody(chunks),
      });
    } catch {
      // Request may have been aborted (e.g. by stop button) -- expected
    }
  });

  return captured;
}

function splitIntoChunks(text: string, count: number): string[] {
  const chunkSize = Math.max(1, Math.ceil(text.length / count));
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  return chunks.length > 0 ? chunks : [""];
}

export async function unmockChatStream(page: Page): Promise<void> {
  await page.unroute("**/api/chat");
}
