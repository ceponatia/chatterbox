import type { ModelMessage } from "ai";

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Array<Record<string, unknown>>)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

export function sanitizeMessagesForPlainText(
  messages: ModelMessage[],
): ModelMessage[] {
  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => {
      if (m.role === "system") return m;
      const text = extractTextFromContent(m.content);
      if (!text) return null;
      return { ...m, content: text } as ModelMessage;
    })
    .filter((m): m is ModelMessage => m !== null);
}
