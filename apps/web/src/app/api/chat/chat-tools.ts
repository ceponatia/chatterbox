import { tool, jsonSchema } from "ai";
import {
  parseMarkdownToStructured,
  resolveEntityName,
} from "@/lib/story-state-model";
import type { PromptSegment } from "@chatterbox/prompt-assembly";

const CHARACTER_DETAIL_SEGMENT_IDS = [
  "appearance_visual",
  "outfit_hairstyle",
  "voice_sound",
  "mannerisms",
] as const;

const STORY_CONTEXT_SEGMENT_IDS = ["relationship_status"] as const;

const BACKSTORY_SEGMENT_ID = "backstory";
const INTERACTION_GUIDE_SEGMENT_ID = "interaction_guide";

const ASPECT_SEGMENT_MAP = {
  appearance: "appearance_visual",
  outfit: "outfit_hairstyle",
  voice: "voice_sound",
  mannerisms: "mannerisms",
} as const;

const DEFAULT_MAX_FACTS = 8;
const DEFAULT_MAX_RELATIONSHIPS = 8;
const DEFAULT_MAX_THREADS = 6;

export function compactText(text: string, maxChars = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "\u2026";
}

function clampPositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (!value || value < 1) return fallback;
  return Math.floor(value);
}

function filterSegmentsByIds(
  segments: readonly PromptSegment[],
  ids: readonly string[],
): PromptSegment[] {
  return segments.filter((segment) => ids.includes(segment.id));
}

function hasNameMatch(content: string, characterName?: string): boolean {
  if (!characterName?.trim()) return true;
  return content.toLowerCase().includes(characterName.trim().toLowerCase());
}

function getSegmentText(
  segments: readonly PromptSegment[],
  ids: readonly string[],
): string {
  return filterSegmentsByIds(segments, ids)
    .map((segment) => `### ${segment.label}\n${segment.content}`)
    .join("\n\n")
    .trim();
}

type CharacterDetailsInput = {
  characterName?: string;
  aspects: Array<"appearance" | "outfit" | "voice" | "mannerisms">;
};

type StoryContextInput = {
  includeFacts?: boolean;
  includeRelationships?: boolean;
  includeThreads?: boolean;
  includeDetails?: boolean;
  maxFacts?: number;
  maxRelationships?: number;
  maxThreads?: number;
  factTags?: Array<
    "biographical" | "spatial" | "relational" | "temporal" | "world" | "event"
  >;
};

type CheckRelationshipInput = {
  fromName: string;
  toName: string;
};

function getCharacterDetailSegmentIds(
  aspects: CharacterDetailsInput["aspects"],
): string[] {
  const segmentIds = Array.from(
    new Set(
      (aspects ?? []).map(
        (aspect: keyof typeof ASPECT_SEGMENT_MAP) => ASPECT_SEGMENT_MAP[aspect],
      ),
    ),
  );
  return segmentIds.length > 0 ? segmentIds : [...CHARACTER_DETAIL_SEGMENT_IDS];
}

function createCharacterDetailsTool(allSegments: readonly PromptSegment[]) {
  return tool({
    description:
      "Retrieve detailed character behavior and presentation context (appearance, outfit, voice, mannerisms).",
    inputSchema: jsonSchema<CharacterDetailsInput>({
      type: "object",
      properties: {
        characterName: { type: "string" },
        aspects: {
          type: "array",
          items: {
            type: "string",
            enum: ["appearance", "outfit", "voice", "mannerisms"],
          },
        },
      },
      required: ["aspects"],
      additionalProperties: false,
    }),
    execute: async ({ characterName, aspects }: CharacterDetailsInput) => ({
      characterName: characterName ?? null,
      details: filterSegmentsByIds(
        allSegments,
        getCharacterDetailSegmentIds(aspects),
      )
        .filter((segment) => hasNameMatch(segment.content, characterName))
        .map((segment) => ({
          id: segment.id,
          label: segment.label,
          content: compactText(segment.content, 320),
        })),
    }),
  });
}

function buildStoryContextFacts(
  activeFacts: ReturnType<typeof parseMarkdownToStructured>["hardFacts"],
  includeFacts: boolean,
  includeDetails: boolean,
  maxFacts: number | undefined,
  factTags: StoryContextInput["factTags"],
) {
  if (!includeFacts) return [];
  const filteredFacts =
    factTags && factTags.length > 0
      ? activeFacts.filter((fact) =>
          (fact.tags ?? []).some((tag) => factTags.includes(tag)),
        )
      : activeFacts;
  return filteredFacts
    .slice(0, clampPositiveInt(maxFacts, DEFAULT_MAX_FACTS))
    .map((fact) => ({
      summary: fact.summary ?? fact.fact,
      tags: fact.tags ?? [],
      detail: includeDetails ? fact.fact : compactText(fact.fact, 160),
    }));
}

function buildStoryContextRelationships(
  structured: ReturnType<typeof parseMarkdownToStructured>,
  includeRelationships: boolean,
  includeDetails: boolean,
  maxRelationships: number | undefined,
) {
  if (!includeRelationships) return [];
  return structured.relationships
    .slice(0, clampPositiveInt(maxRelationships, DEFAULT_MAX_RELATIONSHIPS))
    .map((relationship) => ({
      from: resolveEntityName(structured.entities, relationship.fromEntityId),
      to: resolveEntityName(structured.entities, relationship.toEntityId),
      tone: relationship.tone ?? "neutral",
      description: includeDetails
        ? relationship.description
        : compactText(relationship.description, 140),
      details: includeDetails
        ? relationship.details
        : relationship.details
            .slice(0, 1)
            .map((entry) => compactText(entry, 90)),
    }));
}

function buildStoryContextThreads(
  structured: ReturnType<typeof parseMarkdownToStructured>,
  includeThreads: boolean,
  includeDetails: boolean,
  maxThreads: number | undefined,
) {
  if (!includeThreads) return [];
  return structured.openThreads
    .filter(
      (thread) => thread.status === "active" || thread.status === "evolved",
    )
    .slice(0, clampPositiveInt(maxThreads, DEFAULT_MAX_THREADS))
    .map((thread) => ({
      hook: compactText(thread.hook ?? thread.description, 90),
      description: includeDetails
        ? thread.description
        : compactText(thread.description, 160),
      status: thread.status,
      resolutionHint: includeDetails
        ? thread.resolutionHint
        : compactText(thread.resolutionHint, 100),
    }));
}

function createStoryContextTool(
  allSegments: readonly PromptSegment[],
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description:
      "Retrieve story context details for hard facts, relationships, and open threads.",
    inputSchema: jsonSchema<StoryContextInput>({
      type: "object",
      properties: {
        includeFacts: { type: "boolean" },
        includeRelationships: { type: "boolean" },
        includeThreads: { type: "boolean" },
        includeDetails: { type: "boolean" },
        maxFacts: { type: "number" },
        maxRelationships: { type: "number" },
        maxThreads: { type: "number" },
        factTags: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "biographical",
              "spatial",
              "relational",
              "temporal",
              "world",
              "event",
            ],
          },
        },
      },
      additionalProperties: false,
    }),
    execute: async ({
      includeFacts = true,
      includeRelationships = true,
      includeThreads = true,
      includeDetails = false,
      maxFacts,
      maxRelationships,
      maxThreads,
      factTags,
    }: StoryContextInput) => {
      const activeFacts = structured.hardFacts.filter(
        (fact) => !fact.superseded,
      );
      const segmentContext = getSegmentText(
        allSegments,
        STORY_CONTEXT_SEGMENT_IDS,
      );
      return {
        facts: buildStoryContextFacts(
          activeFacts,
          includeFacts,
          includeDetails,
          maxFacts,
          factTags,
        ),
        relationships: buildStoryContextRelationships(
          structured,
          includeRelationships,
          includeDetails,
          maxRelationships,
        ),
        threads: buildStoryContextThreads(
          structured,
          includeThreads,
          includeDetails,
          maxThreads,
        ),
        segmentContext: includeDetails
          ? segmentContext
          : compactText(segmentContext, 240),
      };
    },
  });
}

function createBackstoryTool(allSegments: readonly PromptSegment[]) {
  return tool({
    description: "Retrieve backstory context details.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => ({
      content: compactText(
        getSegmentText(allSegments, [BACKSTORY_SEGMENT_ID]),
        420,
      ),
    }),
  });
}

function createCheckRelationshipTool(
  structured: ReturnType<typeof parseMarkdownToStructured>,
) {
  return tool({
    description:
      "Check relationship context between two named characters from current state.",
    inputSchema: jsonSchema<CheckRelationshipInput>({
      type: "object",
      properties: {
        fromName: { type: "string" },
        toName: { type: "string" },
      },
      required: ["fromName", "toName"],
      additionalProperties: false,
    }),
    execute: async ({ fromName, toName }: CheckRelationshipInput) => {
      const normalize = (value: string) => value.trim().toLowerCase();
      const from = normalize(fromName);
      const to = normalize(toName);

      const relationships = structured.relationships
        .filter((relationship) => {
          const resolvedFrom = resolveEntityName(
            structured.entities,
            relationship.fromEntityId,
          ).toLowerCase();
          const resolvedTo = resolveEntityName(
            structured.entities,
            relationship.toEntityId,
          ).toLowerCase();
          return (
            (resolvedFrom === from && resolvedTo === to) ||
            (resolvedFrom === to && resolvedTo === from)
          );
        })
        .map((relationship) => ({
          from: resolveEntityName(
            structured.entities,
            relationship.fromEntityId,
          ),
          to: resolveEntityName(structured.entities, relationship.toEntityId),
          tone: relationship.tone ?? "neutral",
          description: compactText(relationship.description, 180),
          details: relationship.details
            .slice(0, 2)
            .map((entry) => compactText(entry, 100)),
        }));

      return { fromName, toName, relationships };
    },
  });
}

function createInteractionGuidelinesTool(
  allSegments: readonly PromptSegment[],
) {
  return tool({
    description: "Retrieve interaction guidelines context.",
    inputSchema: jsonSchema<Record<string, never>>({
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    execute: async () => ({
      content: compactText(
        getSegmentText(allSegments, [INTERACTION_GUIDE_SEGMENT_ID]),
        420,
      ),
    }),
  });
}

export function createChatTools(
  allSegments: readonly PromptSegment[],
  storyState: string,
) {
  const structured = parseMarkdownToStructured(storyState);

  return {
    get_character_details: createCharacterDetailsTool(allSegments),
    get_story_context: createStoryContextTool(allSegments, structured),
    get_backstory: createBackstoryTool(allSegments),
    check_relationship: createCheckRelationshipTool(structured),
    get_interaction_guidelines: createInteractionGuidelinesTool(allSegments),
  };
}
