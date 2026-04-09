import type { Entity } from "./types.js";

const EXIT_VERB_PATTERN =
  /\b(left|leaves|leaving|walked out|walks out|walked away|walks away|stepped out|steps out|exited|exits|departed|departs|stormed out|slipped out|headed out|rushes out|rushed out|ran out|runs out)\b/i;

const EXIT_CONTEXT_PATTERN =
  /\b(outside|out of|out the|through the door|toward the door|towards the door|to the door|from the room|from the building|hallway|stairwell|stairs|lobby|street|bus stop)\b/i;

const NEGATION_PATTERN =
  /\b(not|never|didn't|did not|wasn't|was not|isn't|is not|without)\b/i;

function normalize(text: string): string {
  return text.toLowerCase();
}

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
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasNegatedExit(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  const idx = lower.search(EXIT_VERB_PATTERN);
  if (idx < 0) return false;
  const windowStart = Math.max(0, idx - 24);
  const prefix = lower.slice(windowStart, idx);
  return NEGATION_PATTERN.test(prefix);
}

function indicatesEntityExit(message: string, entityName: string): boolean {
  const sentences = splitSentences(message);
  for (const sentence of sentences) {
    if (!hasStandaloneName(sentence, entityName)) continue;
    if (!EXIT_VERB_PATTERN.test(sentence)) continue;
    if (hasNegatedExit(sentence)) continue;
    if (!EXIT_CONTEXT_PATTERN.test(sentence) && !/\bout\b/i.test(sentence)) {
      continue;
    }
    return true;
  }
  return false;
}

export function scanPresenceFromAssistantMessage(params: {
  assistantText: string;
  entities: Entity[];
  currentPresentEntityIds: readonly string[];
}): { addEntityIds: string[]; removeEntityIds: string[] } {
  const { assistantText, entities, currentPresentEntityIds } = params;
  const text = normalize(assistantText);
  if (!text.trim()) return { addEntityIds: [], removeEntityIds: [] };

  const presentSet = new Set(currentPresentEntityIds);
  const addEntityIds: string[] = [];
  const removeEntityIds: string[] = [];

  for (const entity of entities) {
    if (!entity.name.trim() || entity.isPlayerCharacter) continue;

    const mentioned = hasStandaloneName(text, entity.name);
    if (mentioned && !presentSet.has(entity.id)) {
      addEntityIds.push(entity.id);
    }

    if (presentSet.has(entity.id) && indicatesEntityExit(text, entity.name)) {
      removeEntityIds.push(entity.id);
    }
  }

  return { addEntityIds, removeEntityIds };
}
