import {
  streamText,
  UIMessage,
  type ModelMessage,
  convertToModelMessages,
  tool,
  jsonSchema,
  stepCountIs,
} from "ai";
import {
  logRequest,
  startTimer,
  logStreamStart,
  logStreamEnd,
  logReasoning,
  log,
  logWarn,
  logError,
} from "@/lib/api-logger";
import {
  createDefaultAssembler,
  createAssemblerFromSerialized,
} from "@chatterbox/prompt-assembly";
import type {
  AssemblyContext,
  AssemblyResult,
  SerializedSegment,
} from "@chatterbox/prompt-assembly";
import { computeTopicScores } from "@/lib/topic-embeddings";
import { parseStateFields } from "@/lib/state-utils";
import { openrouter } from "@/lib/openrouter";
import { DEFAULT_MODEL_ID, getModelEntry } from "@/lib/model-registry";
import {
  parseMarkdownToStructured,
  resolveEntityName,
} from "@/lib/story-state-model";
import type { PromptSegment } from "@chatterbox/prompt-assembly";

interface ChatSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tokenBudget?: number;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function normalizeAlias(raw: string): string | null {
  const cleaned = raw.trim().replace(/^["'“”‘’]|["'“”‘’.!,?:;]+$/g, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2}$/.test(cleaned)) {
    return null;
  }
  if (["I", "Im", "I'm", "My", "Me"].includes(cleaned)) return null;
  return cleaned;
}

function extractPrimaryUserFromCast(storyState: string): string | null {
  const castSection = storyState.match(/##\s*Cast\b([\s\S]*?)(?=\n##\s+|$)/i);
  if (!castSection) return null;
  const castBody = castSection[1] ?? "";
  if (!castBody) return null;

  const nameMatches = [...castBody.matchAll(/^\s*-\s+\*\*(.+?)\*\*/gm)];
  const secondMember = nameMatches[1]?.[1];
  if (!secondMember) return null;
  return normalizeAlias(secondMember);
}

function buildRuntimePlayerBoundary(primaryUserAlias: string | null): string {
  const identityClause = primaryUserAlias
    ? `- There is exactly ONE primary user character in this session: "${primaryUserAlias}".\n- Treat only "${primaryUserAlias}" as {{ user }}. All other named characters are NPCs unless explicitly changed in story state.`
    : "- There is exactly ONE primary user character, but it could not be resolved from Cast.\n- Until Cast is resolved, treat ambiguous identity as player-controlled and avoid writing for that character.";

  return [
    "## Player Control Boundary (Critical)",
    "- The second member of the Cast list is the canonical {{ user }} identity.",
    identityClause,
    "- NEVER write dialogue, actions, thoughts, decisions, intentions, or internal state for the player-controlled entity.",
    "- NEVER decide what the player says, does, feels, notices, or concludes.",
    "- If a sentence would make the player-controlled character the subject of a new action or thought, do not write it.",
    "- If identity is ambiguous, ask an in-world clarifying question and continue with NPC/environment narration only.",
  ].join("\n");
}

type SystemPromptMessage = {
  role: "system";
  content: string;
  providerOptions?: Record<string, Record<string, unknown>>;
};

function createSystemMessage(
  content: string,
  withCacheControl: boolean,
): SystemPromptMessage {
  if (!withCacheControl) {
    return { role: "system", content };
  }

  return {
    role: "system",
    content,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  };
}

function buildSystemPrompt(
  assemblyPrompt: string,
  storyState: string,
  runtimeBoundary: string,
): SystemPromptMessage[] {
  const messages: SystemPromptMessage[] = [
    createSystemMessage(`${assemblyPrompt}\n\n${TOOLS_INSTRUCTION}`, true),
  ];

  if (storyState) {
    messages.push(
      createSystemMessage(
        "## Current Story State\n\n" +
          "The following is the current canon of this roleplay. All facts listed are established truth - do not contradict them, especially Hard Facts.\n\n" +
          storyState,
        true,
      ),
    );
  }

  messages.push(createSystemMessage(runtimeBoundary, false));
  messages.push(createSystemMessage(NPC_ONLY_GUARDRAIL, false));
  return messages;
}

const defaultAssembler = createDefaultAssembler();

const NPC_ONLY_GUARDRAIL = [
  "## Response Boundary (Critical)",
  "- NEVER write dialogue, actions, thoughts, decisions, intentions, or internal state on behalf of the user/player.",
  "- Only write for NPCs and the environment.",
  "- Leave all user/player speech, actions, and choices for the user to provide.",
  "- If uncertain whether a named person is the user/player, treat them as player-controlled and avoid writing for them.",
].join("\n");

const MAX_MESSAGES = 60;
const VERBATIM_TIER_SIZE = 20;
const SUMMARY_TIER_SIZE = 20;
const SUMMARY_PAIR_LIMIT = 8;
const DIGEST_SNIPPET_LIMIT = 6;

const CHARACTER_DETAIL_SEGMENT_IDS = [
  "appearance_visual",
  "outfit_hairstyle",
  "voice_sound",
  "mannerisms",
] as const;

const STORY_CONTEXT_SEGMENT_IDS = ["relationship_status"] as const;

const BACKSTORY_SEGMENT_ID = "backstory";
const INTERACTION_GUIDE_SEGMENT_ID = "interaction_guide";

const TOOLS_INSTRUCTION = [
  "## Tool Usage",
  "- Use tools only when specific missing detail is needed for this turn.",
  "- If the user asks about relationships, hard facts, or unresolved threads, call get_story_context before answering.",
  "- Prefer at most 1 tool call per turn; use a 2nd call only if strictly necessary.",
  "- Prefer compact retrieval first; request broader detail only when needed.",
  "- If details are not needed for the current turn, respond without calling tools.",
].join("\n");

const ASPECT_SEGMENT_MAP = {
  appearance: "appearance_visual",
  outfit: "outfit_hairstyle",
  voice: "voice_sound",
  mannerisms: "mannerisms",
} as const;

const DEFAULT_MAX_FACTS = 8;
const DEFAULT_MAX_RELATIONSHIPS = 8;
const DEFAULT_MAX_THREADS = 6;

function clampPositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (!value || value < 1) return fallback;
  return Math.floor(value);
}

function compactText(text: string, maxChars = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function windowMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  log(
    `  \x1b[2m✂ windowed ${messages.length} → ${MAX_MESSAGES} messages\x1b[0m`,
    "info",
  );
  return messages.slice(-MAX_MESSAGES);
}

interface IndexedMessage {
  index: number;
  message: UIMessage;
  text: string;
}

interface PairSummary {
  score: number;
  text: string;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeMessageText(text: string, maxChars = 220): string {
  const cleaned = stripMarkdown(text);
  if (!cleaned) return "";

  const sentences = splitSentences(cleaned);
  const selected = sentences.filter((sentence) => {
    return (
      sentence.includes('"') ||
      /[?!]/.test(sentence) ||
      /\b(ask|say|said|tell|told|walk|look|turn|leave|enter|move|touch|notice|remember)\b/i.test(
        sentence,
      )
    );
  });
  const source = selected.length > 0 ? selected : sentences;
  const first = source[0] ?? "";
  const last = source[source.length - 1] ?? "";
  const combined = first === last ? first : `${first} ${last}`;

  if (combined.length <= maxChars) return combined;
  return combined.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid] ?? 0;
}

function scoreMessages(messages: IndexedMessage[]): Map<number, number> {
  const lengths = messages.map((entry) => entry.text.length);
  const medianLength = median(lengths);
  const scores = new Map<number, number>();

  for (const entry of messages) {
    const text = entry.text;
    const lower = text.toLowerCase();
    let score = 0;

    const nameMentions =
      text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g)?.length ?? 0;
    score += Math.min(2, nameMentions) * 3;

    if (/[?!]/.test(text)) score += 2;
    if (text.length > medianLength) score += 2;
    if (
      /\b(angry|sad|afraid|happy|love|hate|panic|cry|shocked|jealous|nervous|furious)\b/i.test(
        lower,
      )
    ) {
      score += 1;
    }

    const ageFromNewest = messages.length - 1 - entry.index;
    const recencyBonus = 3 * Math.exp(-ageFromNewest / 10);
    score += recencyBonus;

    scores.set(entry.index, score);
  }

  return scores;
}

function topIndexesByScore(
  indexes: number[],
  scores: Map<number, number>,
  limit: number,
): number[] {
  return [...indexes]
    .sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
    .slice(0, limit);
}

function summarizePairs(
  summaryTier: IndexedMessage[],
  scores: Map<number, number>,
): string[] {
  const sorted = [...summaryTier].sort((a, b) => a.index - b.index);
  const pairs: PairSummary[] = [];
  let pendingUser: IndexedMessage | null = null;

  for (const entry of sorted) {
    if (entry.message.role === "user") {
      pendingUser = entry;
      continue;
    }

    if (entry.message.role !== "assistant") continue;

    if (pendingUser) {
      const userSummary = summarizeMessageText(pendingUser.text, 140);
      const assistantSummary = summarizeMessageText(entry.text, 180);
      const pairScore =
        ((scores.get(pendingUser.index) ?? 0) +
          (scores.get(entry.index) ?? 0)) /
        2;
      pairs.push({
        score: pairScore,
        text: `- U: ${userSummary} | A: ${assistantSummary}`,
      });
      pendingUser = null;
    } else {
      pairs.push({
        score: scores.get(entry.index) ?? 0,
        text: `- A: ${summarizeMessageText(entry.text, 220)}`,
      });
    }
  }

  if (pendingUser) {
    pairs.push({
      score: scores.get(pendingUser.index) ?? 0,
      text: `- U: ${summarizeMessageText(pendingUser.text, 220)}`,
    });
  }

  return pairs
    .sort((a, b) => b.score - a.score)
    .slice(0, SUMMARY_PAIR_LIMIT)
    .map((entry) => entry.text);
}

function summarizeDigest(
  digestTier: IndexedMessage[],
  scores: Map<number, number>,
): string {
  if (digestTier.length === 0) return "";

  const top = [...digestTier]
    .sort((a, b) => (scores.get(b.index) ?? 0) - (scores.get(a.index) ?? 0))
    .slice(0, DIGEST_SNIPPET_LIMIT)
    .sort((a, b) => a.index - b.index)
    .map((entry) => summarizeMessageText(entry.text, 120))
    .filter(Boolean);

  return top.join(" ");
}

function buildHistorySummary(
  digestSummary: string,
  pairSummaries: string[],
): string | null {
  if (!digestSummary && pairSummaries.length === 0) return null;

  const lines: string[] = [
    "[Conversation History Summary]",
    "This is compressed earlier context. Prioritize recent verbatim turns when conflicts exist.",
  ];

  if (digestSummary) {
    lines.push(`Digest (oldest context): ${digestSummary}`);
  }
  if (pairSummaries.length > 0) {
    lines.push("Summary Tier (important mid-history turns):");
    lines.push(...pairSummaries);
  }

  return lines.join("\n");
}

function buildCompressedHistory(windowed: UIMessage[]): {
  verbatimMessages: UIMessage[];
  historySummary: string | null;
  stats: {
    total: number;
    verbatim: number;
    summary: number;
    digest: number;
    promotedToVerbatim: number;
    promotedToSummary: number;
  };
} {
  if (windowed.length <= VERBATIM_TIER_SIZE) {
    return {
      verbatimMessages: windowed,
      historySummary: null,
      stats: {
        total: windowed.length,
        verbatim: windowed.length,
        summary: 0,
        digest: 0,
        promotedToVerbatim: 0,
        promotedToSummary: 0,
      },
    };
  }

  const indexed: IndexedMessage[] = windowed.map((message, index) => ({
    index,
    message,
    text: getMessageText(message),
  }));
  const scores = scoreMessages(indexed);
  const total = indexed.length;

  const verbatimStart = Math.max(0, total - VERBATIM_TIER_SIZE);
  const summaryStart = Math.max(
    0,
    total - (VERBATIM_TIER_SIZE + SUMMARY_TIER_SIZE),
  );

  const baseVerbatim = indexed.slice(verbatimStart).map((entry) => entry.index);
  const baseSummary = indexed
    .slice(summaryStart, verbatimStart)
    .map((entry) => entry.index);
  const baseDigest = indexed.slice(0, summaryStart).map((entry) => entry.index);

  const promotionCandidates = [...baseSummary, ...baseDigest];
  const promotedToVerbatim = topIndexesByScore(
    promotionCandidates,
    scores,
    Math.min(2, promotionCandidates.length),
  );
  const promotedToSummary = topIndexesByScore(
    baseDigest.filter((index) => !promotedToVerbatim.includes(index)),
    scores,
    Math.min(4, baseDigest.length),
  );

  const verbatimSet = new Set<number>([...baseVerbatim, ...promotedToVerbatim]);
  const summarySet = new Set<number>([...baseSummary, ...promotedToSummary]);
  for (const idx of verbatimSet) {
    summarySet.delete(idx);
  }

  const verbatimMessages = indexed
    .filter((entry) => verbatimSet.has(entry.index))
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.message);
  const summaryTier = indexed.filter((entry) => summarySet.has(entry.index));
  const digestTier = indexed.filter(
    (entry) => !verbatimSet.has(entry.index) && !summarySet.has(entry.index),
  );

  const pairSummaries = summarizePairs(summaryTier, scores);
  const digestSummary = summarizeDigest(digestTier, scores);
  const historySummary = buildHistorySummary(digestSummary, pairSummaries);

  return {
    verbatimMessages,
    historySummary,
    stats: {
      total,
      verbatim: verbatimMessages.length,
      summary: summaryTier.length,
      digest: digestTier.length,
      promotedToVerbatim: promotedToVerbatim.length,
      promotedToSummary: promotedToSummary.length,
    },
  };
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

function createChatTools(
  allSegments: readonly PromptSegment[],
  storyState: string,
) {
  const structured = parseMarkdownToStructured(storyState);

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

  return {
    get_character_details: tool({
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
      execute: async ({ characterName, aspects }: CharacterDetailsInput) => {
        const targetSegmentIds = Array.from(
          new Set(
            (aspects ?? []).map(
              (aspect: keyof typeof ASPECT_SEGMENT_MAP) =>
                ASPECT_SEGMENT_MAP[aspect],
            ),
          ),
        );
        const effectiveSegmentIds =
          targetSegmentIds.length > 0
            ? targetSegmentIds
            : [...CHARACTER_DETAIL_SEGMENT_IDS];

        const sourceSegments = filterSegmentsByIds(
          allSegments,
          effectiveSegmentIds,
        )
          .filter((segment) => hasNameMatch(segment.content, characterName))
          .map((segment) => ({
            id: segment.id,
            label: segment.label,
            content: compactText(segment.content, 320),
          }));

        return {
          characterName: characterName ?? null,
          details: sourceSegments,
        };
      },
    }),

    get_story_context: tool({
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
        const filteredFacts =
          factTags && factTags.length > 0
            ? activeFacts.filter((fact) =>
                (fact.tags ?? []).some((tag) => factTags.includes(tag)),
              )
            : activeFacts;
        const factLimit = clampPositiveInt(maxFacts, DEFAULT_MAX_FACTS);
        const relationshipLimit = clampPositiveInt(
          maxRelationships,
          DEFAULT_MAX_RELATIONSHIPS,
        );
        const threadLimit = clampPositiveInt(maxThreads, DEFAULT_MAX_THREADS);

        return {
          facts: includeFacts
            ? filteredFacts.slice(0, factLimit).map((fact) => ({
                summary: fact.summary ?? fact.fact,
                tags: fact.tags ?? [],
                detail: includeDetails
                  ? fact.fact
                  : compactText(fact.fact, 160),
              }))
            : [],
          relationships: includeRelationships
            ? structured.relationships
                .slice(0, relationshipLimit)
                .map((rel) => ({
                  from: resolveEntityName(
                    structured.entities,
                    rel.fromEntityId,
                  ),
                  to: resolveEntityName(structured.entities, rel.toEntityId),
                  tone: rel.tone ?? "neutral",
                  description: includeDetails
                    ? rel.description
                    : compactText(rel.description, 140),
                  details: includeDetails
                    ? rel.details
                    : rel.details
                        .slice(0, 1)
                        .map((entry) => compactText(entry, 90)),
                }))
            : [],
          threads: includeThreads
            ? structured.openThreads
                .filter(
                  (thread) =>
                    thread.status === "active" || thread.status === "evolved",
                )
                .slice(0, threadLimit)
                .map((thread) => ({
                  hook: compactText(thread.hook ?? thread.description, 90),
                  description: includeDetails
                    ? thread.description
                    : compactText(thread.description, 160),
                  status: thread.status,
                  resolutionHint: includeDetails
                    ? thread.resolutionHint
                    : compactText(thread.resolutionHint, 100),
                }))
            : [],
          segmentContext: includeDetails
            ? getSegmentText(allSegments, STORY_CONTEXT_SEGMENT_IDS)
            : compactText(
                getSegmentText(allSegments, STORY_CONTEXT_SEGMENT_IDS),
                240,
              ),
        };
      },
    }),

    get_backstory: tool({
      description: "Retrieve backstory context details.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        return {
          content: compactText(
            getSegmentText(allSegments, [BACKSTORY_SEGMENT_ID]),
            420,
          ),
        };
      },
    }),

    check_relationship: tool({
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

        const matches = structured.relationships.filter((relationship) => {
          const fromResolved = resolveEntityName(
            structured.entities,
            relationship.fromEntityId,
          ).toLowerCase();
          const toResolved = resolveEntityName(
            structured.entities,
            relationship.toEntityId,
          ).toLowerCase();
          return (
            (fromResolved === from && toResolved === to) ||
            (fromResolved === to && toResolved === from)
          );
        });

        return {
          fromName,
          toName,
          relationships: matches.map((relationship) => ({
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
          })),
        };
      },
    }),

    get_interaction_guidelines: tool({
      description: "Retrieve interaction guidelines context.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        return {
          content: compactText(
            getSegmentText(allSegments, [INTERACTION_GUIDE_SEGMENT_ID]),
            420,
          ),
        };
      },
    }),
  };
}

const SETTING_DEFAULTS = {
  temperature: 0.85,
  maxTokens: 1024,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

function resolveSettings(s: ChatSettings) {
  const merged = { ...SETTING_DEFAULTS, ...s };
  return {
    temperature: merged.temperature,
    maxOutputTokens: merged.maxTokens,
    topP: merged.topP,
    frequencyPenalty: merged.frequencyPenalty,
    presencePenalty: merged.presencePenalty,
  };
}

async function buildAssemblyContext(
  messages: UIMessage[],
  storyState: string,
  settings: ChatSettings,
  presentEntityIds: readonly string[],
  lastIncludedAt?: Record<string, number>,
): Promise<AssemblyContext> {
  const turnNumber = messages.filter((m) => m.role === "user").length;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const currentUserMessage = lastUserMsg ? getMessageText(lastUserMsg) : "";
  const topicScores = await computeTopicScores(currentUserMessage);
  return {
    turnNumber,
    lastIncludedAt: lastIncludedAt ?? {},
    currentUserMessage,
    stateFields: parseStateFields(storyState),
    presentEntityIds,
    tokenBudget: settings.tokenBudget ?? 2500,
    topicScores,
  };
}

function logAssembly(assembly: AssemblyResult, ctx: AssemblyContext) {
  const budgetPct = Math.round(
    (assembly.tokenEstimate / ctx.tokenBudget) * 100,
  );
  const omittedReasons = new Map<string, number>();
  for (const o of assembly.omitted) {
    omittedReasons.set(o.reason, (omittedReasons.get(o.reason) ?? 0) + 1);
  }
  const reasonSummary = [...omittedReasons.entries()]
    .map(([r, n]) => `${r}(${n})`)
    .join(", ");
  log(
    `  \x1b[2m🧩 assembly t${ctx.turnNumber}: ` +
      `${assembly.included.length} included, ${assembly.omitted.length} omitted, ` +
      `~${assembly.tokenEstimate}/${ctx.tokenBudget} tokens (${budgetPct}%)` +
      (reasonSummary ? ` | omit: ${reasonSummary}` : "") +
      `\x1b[0m`,
    "info",
  );
}

function logCompression(stats: {
  total: number;
  verbatim: number;
  summary: number;
  digest: number;
  promotedToVerbatim: number;
  promotedToSummary: number;
}) {
  if (stats.total <= VERBATIM_TIER_SIZE) return;
  log(
    `  \x1b[2m🗜 history: total=${stats.total}, verbatim=${stats.verbatim}, summary=${stats.summary}, digest=${stats.digest}, promotions(v=${stats.promotedToVerbatim}, s=${stats.promotedToSummary})\x1b[0m`,
    "info",
  );
}

function estimateJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function getToolName(toolCall: Record<string, unknown>): string {
  const fromToolName = toolCall.toolName;
  if (typeof fromToolName === "string" && fromToolName.length > 0) {
    return fromToolName;
  }
  const fromName = toolCall.name;
  if (typeof fromName === "string" && fromName.length > 0) {
    return fromName;
  }
  return "unknown_tool";
}

interface ToolTelemetry {
  stepCount: number;
  toolCallCount: number;
  inputBytes: number;
  outputBytes: number;
  byTool: Map<string, number>;
}

interface ToolTelemetryMeta {
  route: string;
  modelId: string;
  turnNumber: number;
  compression: {
    windowedMessages: number;
    windowedChars: number;
    verbatimMessages: number;
    verbatimChars: number;
    summaryMessages: number;
    digestMessages: number;
    promotedToVerbatim: number;
    promotedToSummary: number;
    hasHistorySummary: boolean;
    historySummaryChars: number;
    effectiveContextChars: number;
    compressionRatio: number;
  };
}

function estimateMessagesChars(messages: readonly UIMessage[]): number {
  return messages.reduce(
    (sum, message) => sum + getMessageText(message).length,
    0,
  );
}

function collectToolTelemetry(telemetry: ToolTelemetry, stepResult: unknown) {
  if (!stepResult || typeof stepResult !== "object") return;
  telemetry.stepCount += 1;

  const step = stepResult as Record<string, unknown>;
  const staticCalls = Array.isArray(step.toolCalls)
    ? (step.toolCalls as unknown[])
    : [];
  const dynamicCalls = Array.isArray(step.dynamicToolCalls)
    ? (step.dynamicToolCalls as unknown[])
    : [];
  const calls = [...staticCalls, ...dynamicCalls];

  const staticResults = Array.isArray(step.toolResults)
    ? (step.toolResults as unknown[])
    : [];
  const dynamicResults = Array.isArray(step.dynamicToolResults)
    ? (step.dynamicToolResults as unknown[])
    : [];
  const results = [...staticResults, ...dynamicResults];

  telemetry.toolCallCount += calls.length;
  for (const toolCall of calls) {
    if (!toolCall || typeof toolCall !== "object") continue;
    const record = toolCall as Record<string, unknown>;
    const toolName = getToolName(record);
    telemetry.byTool.set(toolName, (telemetry.byTool.get(toolName) ?? 0) + 1);
    telemetry.inputBytes += estimateJsonSize(record);
  }
  for (const toolResult of results) {
    telemetry.outputBytes += estimateJsonSize(toolResult);
  }
}

function formatToolTelemetry(telemetry: ToolTelemetry): string {
  const tools = [...telemetry.byTool.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}(${count})`)
    .join(", ");
  return (
    `steps=${telemetry.stepCount}, calls=${telemetry.toolCallCount}, ` +
    `in~${telemetry.inputBytes}B, out~${telemetry.outputBytes}B` +
    (tools ? `, tools=${tools}` : "")
  );
}

function streamCallbacks(elapsed: () => number, meta: ToolTelemetryMeta) {
  const telemetry: ToolTelemetry = {
    stepCount: 0,
    toolCallCount: 0,
    inputBytes: 0,
    outputBytes: 0,
    byTool: new Map(),
  };

  return {
    onError({ error }: { error: unknown }) {
      logError("/api/chat stream error:", error);
    },
    onStepFinish(stepResult: unknown) {
      collectToolTelemetry(telemetry, stepResult);
    },
    onFinish({
      text,
      reasoningText,
    }: {
      text: string;
      reasoningText?: string;
    }) {
      logReasoning("/api/chat", reasoningText);
      const elapsedMs = elapsed();
      logStreamEnd(meta.route, elapsedMs, text.length);
      const perTool = Object.fromEntries(telemetry.byTool.entries());
      if (telemetry.stepCount > 0) {
        log(
          `  \x1b[2m🛠 tool telemetry: ${formatToolTelemetry(telemetry)}\x1b[0m`,
          "info",
        );
      }
      log(
        JSON.stringify({
          event: "chat_tool_telemetry",
          route: meta.route,
          modelId: meta.modelId,
          turnNumber: meta.turnNumber,
          elapsedMs,
          textChars: text.length,
          stepCount: telemetry.stepCount,
          toolCallCount: telemetry.toolCallCount,
          inputBytesApprox: telemetry.inputBytes,
          outputBytesApprox: telemetry.outputBytes,
          usedTools: telemetry.toolCallCount > 0,
          perTool,
          compression: meta.compression,
        }),
        "info",
      );
      if (text.length === 0 && !reasoningText)
        logWarn("/api/chat: 0 chars returned");
    },
  };
}

export async function POST(req: Request) {
  const {
    messages,
    systemPrompt: _rawSystemPrompt,
    storyState,
    settings,
    presentEntityIds,
    lastIncludedAt,
    customSegments,
  } = (await req.json()) as {
    messages: UIMessage[];
    systemPrompt: string;
    storyState: string;
    settings: ChatSettings;
    presentEntityIds?: string[];
    lastIncludedAt?: Record<string, number>;
    customSegments?: SerializedSegment[] | null;
  };

  const windowed = windowMessages(messages);
  const elapsed = startTimer();
  const ctx = await buildAssemblyContext(
    messages,
    storyState,
    settings,
    presentEntityIds ?? [],
    lastIncludedAt,
  );
  const assembler = customSegments
    ? createAssemblerFromSerialized(customSegments)
    : defaultAssembler;
  const assembly = assembler.assemble(ctx);
  const allSegments = assembler.listSegments();
  const tools = createChatTools(allSegments, storyState);
  const primaryUserAlias = extractPrimaryUserFromCast(storyState);
  const runtimeBoundary = buildRuntimePlayerBoundary(primaryUserAlias);
  const systemMessages = buildSystemPrompt(
    assembly.systemPrompt,
    storyState,
    runtimeBoundary,
  );

  logAssembly(assembly, ctx);
  if (primaryUserAlias) {
    log(
      `  \x1b[2m🪪 primary user bound from Cast[2]: ${primaryUserAlias}\x1b[0m`,
      "info",
    );
  } else {
    logWarn("/api/chat: could not resolve primary user from Cast[2]");
  }
  logRequest("/api/chat", { messages: windowed, storyState, settings });

  try {
    const modelId = settings.model ?? DEFAULT_MODEL_ID;
    const providerOrder =
      getModelEntry(modelId)?.providers ??
      getModelEntry(DEFAULT_MODEL_ID)?.providers ??
      [];

    const compressed = buildCompressedHistory(windowed);
    logCompression(compressed.stats);
    const windowedChars = estimateMessagesChars(windowed);
    const verbatimChars = estimateMessagesChars(compressed.verbatimMessages);
    const historySummaryChars = compressed.historySummary?.length ?? 0;
    const effectiveContextChars = verbatimChars + historySummaryChars;
    const compressionRatio =
      windowedChars > 0
        ? Number((effectiveContextChars / windowedChars).toFixed(4))
        : 1;
    const modelMessages = await convertToModelMessages(
      compressed.verbatimMessages,
    );
    const historySummaryMessage = compressed.historySummary
      ? [{ role: "system" as const, content: compressed.historySummary }]
      : [];
    const mustUseStoryContext =
      /\b(relationship|relationships|thread|threads|hard fact|hard facts|recall|remember)\b/i.test(
        ctx.currentUserMessage,
      );
    const requestMessages = [
      ...systemMessages,
      ...historySummaryMessage,
      ...modelMessages,
    ] as unknown as ModelMessage[];
    const result = streamText({
      model: openrouter(modelId),
      messages: requestMessages,
      tools,
      stopWhen: stepCountIs(3),
      prepareStep: ({ stepNumber }) => {
        if (mustUseStoryContext && stepNumber === 0) {
          return {
            toolChoice: {
              type: "tool" as const,
              toolName: "get_story_context",
            },
          };
        }
        return {};
      },
      ...resolveSettings(settings),
      providerOptions: {
        openrouter: {
          reasoning: { effort: "high" },
          ...(providerOrder.length > 0
            ? { provider: { order: providerOrder } }
            : {}),
        },
      },
      ...streamCallbacks(elapsed, {
        route: "/api/chat",
        modelId,
        turnNumber: ctx.turnNumber,
        compression: {
          windowedMessages: windowed.length,
          windowedChars,
          verbatimMessages: compressed.stats.verbatim,
          verbatimChars,
          summaryMessages: compressed.stats.summary,
          digestMessages: compressed.stats.digest,
          promotedToVerbatim: compressed.stats.promotedToVerbatim,
          promotedToSummary: compressed.stats.promotedToSummary,
          hasHistorySummary: Boolean(compressed.historySummary),
          historySummaryChars,
          effectiveContextChars,
          compressionRatio,
        },
      }),
    });
    logStreamStart("/api/chat");
    return result.toUIMessageStreamResponse();
  } catch (error) {
    logError("/api/chat fatal error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
