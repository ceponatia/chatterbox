import type { ModelMessage } from "ai";
import type { AssemblyResult } from "@chatterbox/prompt-assembly";
import type { PromptSegment } from "@chatterbox/prompt-assembly";
import {
  parseMarkdownToStructured,
  resolveEntityName,
} from "@/lib/story-state-model";
import {
  CHARACTER_DETAIL_SEGMENT_IDS,
  BACKSTORY_SEGMENT_ID,
  INTERACTION_GUIDE_SEGMENT_ID,
  compactText,
} from "./chat-tools";

const TOOL_ACCESSIBLE_SEGMENT_IDS = [
  ...CHARACTER_DETAIL_SEGMENT_IDS,
  BACKSTORY_SEGMENT_ID,
  INTERACTION_GUIDE_SEGMENT_ID,
] as const;

const DEFAULT_MAX_FACTS = 8;
const DEFAULT_MAX_RELATIONSHIPS = 8;
const DEFAULT_MAX_THREADS = 6;

export function buildToolBypassContext(
  allSegments: readonly PromptSegment[],
  assembly: AssemblyResult,
  storyState: string,
): string | null {
  const omittedIds = new Set(assembly.omitted.map((o) => o.id));
  const structured = parseMarkdownToStructured(storyState);

  const omittedSegments = allSegments.filter(
    (s) =>
      (TOOL_ACCESSIBLE_SEGMENT_IDS as readonly string[]).includes(s.id) &&
      omittedIds.has(s.id),
  );

  const activeFacts = structured.hardFacts.filter((f) => !f.superseded);
  const activeThreads = structured.openThreads.filter(
    (t) => t.status === "active" || t.status === "evolved",
  );

  const sections: string[] = [];

  for (const seg of omittedSegments) {
    sections.push(`### ${seg.label}\n${compactText(seg.content, 400)}`);
  }

  if (activeFacts.length > 0) {
    const factLines = activeFacts
      .slice(0, DEFAULT_MAX_FACTS)
      .map((f) => `- ${compactText(f.summary ?? f.fact, 160)}`);
    sections.push(`### Key Facts\n${factLines.join("\n")}`);
  }

  if (structured.relationships.length > 0) {
    const relLines = structured.relationships
      .slice(0, DEFAULT_MAX_RELATIONSHIPS)
      .map((r) => {
        const from = resolveEntityName(structured.entities, r.fromEntityId);
        const to = resolveEntityName(structured.entities, r.toEntityId);
        return `- ${from} <-> ${to} (${r.tone ?? "neutral"}): ${compactText(r.description, 120)}`;
      });
    sections.push(`### Relationships\n${relLines.join("\n")}`);
  }

  if (activeThreads.length > 0) {
    const threadLines = activeThreads
      .slice(0, DEFAULT_MAX_THREADS)
      .map(
        (t) => `- [${t.status}] ${compactText(t.hook ?? t.description, 120)}`,
      );
    sections.push(`### Open Threads\n${threadLines.join("\n")}`);
  }

  if (sections.length === 0) return null;

  return [
    "## Reference Context",
    "The following supplemental context is provided inline. Use naturally when relevant to the current turn.",
    "",
    ...sections,
  ].join("\n");
}

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
