import type { AttributeCategory, FactTag, RelationshipTone } from "./types";

const ATTRIBUTE_KEYWORDS: Record<AttributeCategory, readonly string[]> = {
  face: [
    "face",
    "eyes",
    "eye",
    "smile",
    "mouth",
    "jaw",
    "nose",
    "skin",
    "freckles",
  ],
  hair: ["hair", "hairstyle", "bangs", "braid", "ponytail", "curl"],
  build: [
    "build",
    "body",
    "height",
    "weight",
    "frame",
    "posture",
    "hands",
    "feet",
    "toes",
  ],
  outfit: [
    "outfit",
    "clothes",
    "clothing",
    "wear",
    "jacket",
    "shirt",
    "pants",
    "skirt",
    "dress",
    "shoes",
  ],
  voice: ["voice", "tone", "accent", "speech", "sound", "laugh"],
  scent: ["scent", "smell", "odor", "perfume", "hygiene"],
  movement: ["movement", "moves", "walk", "gait", "gesture", "stance"],
  presence: ["presence", "aura", "vibe", "energy", "impression"],
};

const TONE_KEYWORDS: Record<RelationshipTone, readonly string[]> = {
  hostile: ["hate", "hostile", "enemy", "threat", "resent", "furious"],
  cold: ["cold", "distant", "awkward", "strained", "tense", "guarded"],
  neutral: ["neutral", "professional", "acquaintance", "unknown"],
  warm: ["warm", "friendly", "trust", "fond", "care"],
  close: ["close", "best friend", "family", "devoted", "loyal"],
  intimate: ["intimate", "romantic", "dating", "lover", "married"],
};

const FACT_TAG_KEYWORDS: Record<FactTag, readonly string[]> = {
  biographical: ["name", "age", "job", "occupation", "birthday", "background"],
  spatial: ["location", "room", "street", "city", "home", "at", "in"],
  relational: [
    "friend",
    "enemy",
    "sibling",
    "partner",
    "relationship",
    "trust",
  ],
  temporal: ["today", "yesterday", "tomorrow", "before", "after", "since"],
  world: ["law", "magic", "rule", "world", "setting", "faction"],
  event: ["happened", "incident", "attack", "meeting", "promise", "deal"],
};

export function generateStoryItemId(
  prefix: "thread" | "fact",
  base: string,
): string {
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${prefix}-${normalized || Date.now().toString()}`;
}

export function normalizeTextKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function inferAttributeCategory(
  attribute: string,
  description = "",
): AttributeCategory {
  const haystack = `${attribute} ${description}`.toLowerCase();
  const scoreByCategory = Object.entries(ATTRIBUTE_KEYWORDS).map(
    ([category, words]) => {
      const score = words.reduce(
        (sum, word) => sum + (haystack.includes(word) ? 1 : 0),
        0,
      );
      return { category: category as AttributeCategory, score };
    },
  );

  scoreByCategory.sort((left, right) => right.score - left.score);
  return scoreByCategory[0]?.score ? scoreByCategory[0].category : "presence";
}

export function inferRelationshipTone(text: string): RelationshipTone {
  const lower = text.toLowerCase();
  const order: RelationshipTone[] = [
    "intimate",
    "close",
    "warm",
    "neutral",
    "cold",
    "hostile",
  ];

  for (const tone of order) {
    if (TONE_KEYWORDS[tone].some((word) => lower.includes(word))) {
      return tone;
    }
  }

  return "neutral";
}

export function inferFactTags(fact: string): FactTag[] {
  const lower = fact.toLowerCase();
  const tags = (
    Object.entries(FACT_TAG_KEYWORDS) as [FactTag, readonly string[]][]
  )
    .filter(([, words]) => words.some((word) => lower.includes(word)))
    .map(([tag]) => tag);

  return tags.length > 0 ? tags : ["event"];
}

export function summarizeFact(fact: string): string {
  const normalized = fact.trim().replace(/\s+/g, " ");
  if (!normalized) return "fact";

  const firstClause = normalized.split(/[.;:!?]/)[0] ?? normalized;
  return firstClause.split(" ").slice(0, 8).join(" ");
}

export function deriveThreadHook(description: string): string {
  const normalized = description.trim().replace(/\s+/g, " ");
  if (!normalized) return "open thread";

  const firstClause = normalized.split(/[.;:!?]/)[0] ?? normalized;
  return firstClause.split(" ").slice(0, 7).join(" ");
}
