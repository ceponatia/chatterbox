import { UIMessage } from "ai";
import { log } from "@/lib/api-logger";
import {
  extractFacts,
  type ExtractedFact as DigestExtractedFact,
} from "@/lib/fact-extractor";
import { compactText } from "./chat-tools";

const VERBATIM_TIER_SIZE = 20;
const SUMMARY_TIER_SIZE = 20;
const SUMMARY_PAIR_LIMIT = 8;
const DIGEST_SNIPPET_LIMIT = 6;
const DIGEST_FACT_CACHE_LIMIT = 200;
const MAX_MESSAGES = 60;

export { VERBATIM_TIER_SIZE };

interface DigestFactCacheEntry {
  digestKey: string;
  facts: DigestExtractedFact[];
}

const digestFactCache = new Map<string, DigestFactCacheEntry>();

export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export type EmbeddedPair = {
  turnIndex: number;
  userText: string;
  assistantText: string;
};

export function extractNewPairsForEmbedding(
  allMessages: UIMessage[],
  windowed: UIMessage[],
  verbatimCount: number,
): EmbeddedPair[] {
  if (allMessages.length === 0 || windowed.length === 0) return [];

  const nonVerbatimCount = Math.max(0, windowed.length - verbatimCount);
  if (nonVerbatimCount === 0) return [];

  const windowStart = Math.max(0, allMessages.length - windowed.length);
  const nonVerbatimStart = windowStart;
  const nonVerbatimEnd = nonVerbatimStart + nonVerbatimCount;
  const nonVerbatim = allMessages.slice(nonVerbatimStart, nonVerbatimEnd);
  const pairs: EmbeddedPair[] = [];
  let userTurnIndex =
    allMessages
      .slice(0, nonVerbatimStart)
      .filter((message) => message.role === "user").length - 1;
  let pendingUser: { turnIndex: number; userText: string } | null = null;

  for (const message of nonVerbatim) {
    if (message.role === "user") {
      userTurnIndex += 1;
      const userText = getMessageText(message).trim();
      if (userText) {
        pendingUser = { turnIndex: userTurnIndex, userText };
      }
    } else if (message.role === "assistant" && pendingUser) {
      const assistantText = getMessageText(message).trim();
      if (assistantText) {
        pairs.push({
          turnIndex: pendingUser.turnIndex,
          userText: pendingUser.userText,
          assistantText,
        });
      }
      pendingUser = null;
    }
  }

  return pairs;
}

export function formatRagContext(pairs: EmbeddedPair[]): string {
  const lines = pairs.map(
    (pair) =>
      `Turn ${pair.turnIndex}: U: ${compactText(pair.userText, 120)} | A: ${compactText(pair.assistantText, 180)}`,
  );

  return [
    "[Relevant Past Events]",
    "These are earlier exchanges that may be relevant to the current conversation.",
    ...lines,
  ].join("\n");
}

export function windowMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  log(
    `  \x1b[2m\u2702 windowed ${messages.length} \u2192 ${MAX_MESSAGES} messages\x1b[0m`,
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
    const lower = sentence.toLowerCase();
    return (
      /\b(said|asked|told|replied|whispered|shouted|mentioned|explained|revealed|admitted|declared)\b/.test(
        lower,
      ) ||
      /\b(walked|moved|ran|stepped|entered|left|arrived|turned|reached|grabbed|picked|opened)\b/.test(
        lower,
      ) ||
      /\b(because|since|after|before|when|while|until|if|then|however|but|although)\b/.test(
        lower,
      )
    );
  });
  const source = selected.length > 0 ? selected : sentences;
  const first = source[0] ?? "";
  const last = source[source.length - 1] ?? "";
  const combined = first === last ? first : `${first} ${last}`;

  if (combined.length <= maxChars) return combined;
  return combined.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "\u2026";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function scoreMessages(messages: IndexedMessage[]): Map<number, number> {
  const lengths = messages.map((entry) => entry.text.length);
  const medianLength = median(lengths);
  const scores = new Map<number, number>();

  for (const entry of messages) {
    let score = 0;
    const lengthRatio = medianLength > 0 ? entry.text.length / medianLength : 1;
    score += Math.min(lengthRatio, 2.0) * 0.3;
    const lower = entry.text.toLowerCase();
    if (
      /\b(because|realized|discovered|learned|understood|decided|revealed)\b/.test(
        lower,
      )
    ) {
      score += 0.3;
    }
    if (
      /\b(secret|truth|past|memory|remember|confession|trust|promise|betrayal)\b/.test(
        lower,
      )
    ) {
      score += 0.2;
    }
    if (/["'].{10,}["']/.test(entry.text)) {
      score += 0.1;
    }
    if (entry.message.role === "user") {
      score += 0.1;
    }
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
      if (pendingUser) {
        const score = scores.get(pendingUser.index) ?? 0;
        pairs.push({
          score,
          text: `U: ${summarizeMessageText(pendingUser.text, 100)}`,
        });
      }
      pendingUser = entry;
    } else if (entry.message.role === "assistant") {
      if (pendingUser) {
        const userScore = scores.get(pendingUser.index) ?? 0;
        const assistantScore = scores.get(entry.index) ?? 0;
        const pairScore = (userScore + assistantScore) / 2;
        const userSummary = summarizeMessageText(pendingUser.text, 100);
        const assistantSummary = summarizeMessageText(entry.text, 140);
        pairs.push({
          score: pairScore,
          text: `U: ${userSummary} | A: ${assistantSummary}`,
        });
        pendingUser = null;
      } else {
        const score = scores.get(entry.index) ?? 0;
        pairs.push({
          score,
          text: `A: ${summarizeMessageText(entry.text, 180)}`,
        });
      }
    }
  }

  if (pendingUser) {
    const score = scores.get(pendingUser.index) ?? 0;
    pairs.push({
      score,
      text: `U: ${summarizeMessageText(pendingUser.text, 100)}`,
    });
  }

  return pairs
    .sort((a, b) => b.score - a.score)
    .slice(0, SUMMARY_PAIR_LIMIT)
    .map((entry) => entry.text);
}

function summarizeDigestLegacy(
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

function extractPairsFromTier(tier: IndexedMessage[]): EmbeddedPair[] {
  const sorted = [...tier].sort((a, b) => a.index - b.index);
  const pairs: EmbeddedPair[] = [];
  let pendingUser: IndexedMessage | null = null;

  for (const entry of sorted) {
    if (entry.message.role === "user") {
      pendingUser = entry;
    } else if (entry.message.role === "assistant" && pendingUser) {
      const userText = pendingUser.text.trim();
      const assistantText = entry.text.trim();
      if (userText && assistantText) {
        const userTurnIndex = pendingUser.index;
        pairs.push({ turnIndex: userTurnIndex, userText, assistantText });
      }
      pendingUser = null;
    }
  }

  return pairs;
}

function formatExtractedFacts(facts: DigestExtractedFact[]): string {
  return facts
    .flatMap((fact) =>
      fact.facts.map((line) => `- Turn ${fact.turnIndex}: ${line}`),
    )
    .join("\n");
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildDigestCacheKey(pairs: EmbeddedPair[]): string {
  return pairs
    .map((pair) => {
      const combined =
        pair.userText.slice(0, 80) + pair.assistantText.slice(0, 80);
      return `${pair.turnIndex}:${hashText(combined)}`;
    })
    .join("|");
}

function cacheDigestFacts(
  conversationId: string,
  digestKey: string,
  facts: DigestExtractedFact[],
) {
  if (digestFactCache.size >= DIGEST_FACT_CACHE_LIMIT) {
    const firstKey = digestFactCache.keys().next().value;
    if (firstKey !== undefined) digestFactCache.delete(firstKey);
  }
  digestFactCache.set(conversationId, { digestKey, facts });
}

async function summarizeDigestWithFacts(
  digestTier: IndexedMessage[],
  scores: Map<number, number>,
  conversationId?: string,
): Promise<string> {
  if (digestTier.length === 0) return "";

  const pairs = extractPairsFromTier(digestTier);
  if (pairs.length === 0) {
    return summarizeDigestLegacy(digestTier, scores);
  }

  const digestKey = buildDigestCacheKey(pairs);
  const cached = conversationId ? digestFactCache.get(conversationId) : null;
  if (cached && cached.digestKey === digestKey) {
    return formatExtractedFacts(cached.facts);
  }

  const facts = await extractFacts(pairs);
  if (facts.length === 0) {
    return summarizeDigestLegacy(digestTier, scores);
  }

  if (conversationId) {
    cacheDigestFacts(conversationId, digestKey, facts);
  }

  return formatExtractedFacts(facts);
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
    lines.push("[Key facts from earlier turns]", digestSummary);
  }
  if (pairSummaries.length > 0) {
    lines.push("[Recent compressed pairs]", ...pairSummaries);
  }

  return lines.join("\n");
}

export async function buildCompressedHistory(
  windowed: UIMessage[],
  conversationId?: string,
): Promise<{
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
}> {
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
  const digestSummary = await summarizeDigestWithFacts(
    digestTier,
    scores,
    conversationId,
  );
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

export function estimateMessagesChars(messages: readonly UIMessage[]): number {
  return messages.reduce(
    (sum, message) => sum + getMessageText(message).length,
    0,
  );
}
