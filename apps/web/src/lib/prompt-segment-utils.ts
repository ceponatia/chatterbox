import type { SerializedSegment } from "@chatterbox/prompt-assembly";

export function buildCharacterSegmentLookup(
  segments: SerializedSegment[] | null | undefined,
): Record<string, string> {
  if (!segments) return {};

  const lookup: Record<string, string> = {};
  for (const segment of segments) {
    if (segment.policy.type !== "on_presence") continue;
    lookup[segment.policy.entityId] = segment.id;
  }
  return lookup;
}
