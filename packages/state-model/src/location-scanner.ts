import type { Entity, LocationInfo } from "./types";

export interface LocationChangeResult {
  entityMoves: Array<{
    entityId: string;
    toLocationId: string;
    toLocationName: string;
  }>;
}

export interface LocationScanParams {
  assistantText: string;
  entities: Entity[];
  locations: LocationInfo[];
  currentSceneLocationId?: string;
}

const MOVEMENT_VERB_PATTERN =
  /\b(went to|headed to|walked to|moved to|returned to|left for|stepped into|entered|arrived at|made (?:her|his|their) way to|hurried to|ran to|rushed to|retreated to|wandered to|strolled to)\b/i;

const NEGATION_BEFORE_MOVE_PATTERN =
  /\b(didn't|did not|hadn't|had not|wouldn't|would not|couldn't|could not|never)\b/i;

function hasStandaloneName(message: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const full = new RegExp(`\\b${escaped}\\b`, "i");
  if (full.test(message)) return true;

  const first = name.split(/\s+/)[0]?.trim();
  if (!first || first.length < 3) return false;
  const short = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${short}\\b`, "i").test(message);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchLocationByName(
  text: string,
  locations: LocationInfo[],
): LocationInfo | undefined {
  const lower = text.toLowerCase();

  // Exact match first
  const exact = locations.find(
    (loc) => loc.name.toLowerCase() === lower,
  );
  if (exact) return exact;

  // Word-boundary substring match
  for (const loc of locations) {
    const escaped = loc.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      return loc;
    }
  }

  return undefined;
}

export function scanLocationChangesFromAssistantMessage(
  params: LocationScanParams,
): LocationChangeResult {
  const { assistantText, entities, locations } = params;

  if (locations.length === 0) return { entityMoves: [] };

  const sentences = splitSentences(assistantText);
  const moveMap = new Map<
    string,
    { toLocationId: string; toLocationName: string }
  >();

  for (const sentence of sentences) {
    const verbMatch = MOVEMENT_VERB_PATTERN.exec(sentence);
    if (!verbMatch) continue;

    // Check for negation before the verb
    const prefix = sentence.slice(0, verbMatch.index);
    if (NEGATION_BEFORE_MOVE_PATTERN.test(prefix)) continue;

    // Find which entities are mentioned in this sentence
    const mentionedEntities = entities.filter(
      (e) => !e.isPlayerCharacter && hasStandaloneName(sentence, e.name),
    );
    if (mentionedEntities.length === 0) continue;

    // Extract text after the movement verb and try to match a location
    const afterVerb = sentence.slice(
      verbMatch.index + verbMatch[0].length,
    );
    const location = matchLocationByName(afterVerb, locations);
    if (!location) continue;

    // Record move for each mentioned entity (last wins on dedup)
    for (const entity of mentionedEntities) {
      moveMap.set(entity.id, {
        toLocationId: location.id,
        toLocationName: location.name,
      });
    }
  }

  const entityMoves = [...moveMap.entries()].map(([entityId, dest]) => ({
    entityId,
    ...dest,
  }));

  return { entityMoves };
}
