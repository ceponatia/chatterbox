/**
 * Shared utility for parsing story state markdown into a field map.
 * Used by both the client-side assembly tracker and the server-side chat route
 * to ensure consistent on_state_field policy evaluation.
 *
 * NOTE: This function will be deprecated if the canonical storage format moves
 * from raw markdown to structured JSON. At that point, field presence can be
 * read directly from StructuredStoryState without regex parsing.
 */
export function parseStateFields(storyState: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const sections = storyState.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx === -1) continue;
    const key = section
      .slice(0, newlineIdx)
      .trim()
      .toLowerCase()
      .replace(/\s*\(.*\)$/, "")
      .replace(/\s+/g, "_");
    const value = section.slice(newlineIdx + 1).trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}
