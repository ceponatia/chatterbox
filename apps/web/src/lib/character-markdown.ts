import type { SerializedSegment } from "@chatterbox/prompt-assembly";

export function inferCharacterNameFromMarkdown(
  markdown: string,
): string | null {
  const headingMatch = markdown.trim().match(/^#\s+(.+)$/m);
  const name = headingMatch?.[1]?.trim();
  return name && name.length > 0 ? name : null;
}

export function buildCharacterBehaviorSegment(
  content: string,
  entityId: string,
  entityName: string,
): SerializedSegment | null {
  const trimmed = content.trim();
  if (!trimmed || !entityId) return null;

  const headingName = inferCharacterNameFromMarkdown(trimmed);
  const label = headingName
    ? `${headingName} Behavior Profile`
    : `${entityName || "Character"} Behavior Profile`;

  return {
    id: `character_behavior_${entityId}`,
    label,
    content: trimmed,
    policy: { type: "on_presence", entityId },
    priority: "high",
    order: 35,
    tokenEstimate: Math.ceil(trimmed.length / 4),
    category: "character",
    omittedSummary: entityName
      ? `Behavior profile for ${entityName}`
      : undefined,
  };
}
