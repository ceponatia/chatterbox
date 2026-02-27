import { generateText } from "ai";
import { logWarn } from "@/lib/api-logger";
import { env } from "@/lib/env";
import { openrouter } from "@/lib/openrouter";

const FACT_EXTRACTION_MODEL = env.FACT_EXTRACTION_MODEL;
const MAX_SIDE_CHARS = 600;
const MAX_OUTPUT_TOKENS = 800;

export interface ExtractedFact {
  turnIndex: number;
  facts: string[];
}

interface ConversationPair {
  turnIndex: number;
  userText: string;
  assistantText: string;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd();
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function summarizeLegacyLine(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
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
  return combined.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "...";
}

function buildPrompt(pairs: ConversationPair[]): string {
  const sections = pairs.map((pair) => {
    const userText = truncateText(pair.userText, MAX_SIDE_CHARS);
    const assistantText = truncateText(pair.assistantText, MAX_SIDE_CHARS);
    return [
      `Turn ${pair.turnIndex}:`,
      `User: ${userText || "(empty)"}`,
      `Character: ${assistantText || "(empty)"}`,
    ].join("\n");
  });

  return [
    "Extract key facts from each turn.",
    "For each turn, list concrete events, revelations, decisions, and commitments.",
    "Use concise bullet points.",
    "Omit greetings, filler, and generic narration.",
    "Output format:",
    "Turn <number>:",
    "- fact",
    "",
    ...sections,
  ].join("\n");
}

function parseFacts(text: string): ExtractedFact[] {
  const result: ExtractedFact[] = [];
  const regex = /Turn\s+(\d+)\s*:\s*([\s\S]*?)(?=\nTurn\s+\d+\s*:|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const turnIndex = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(turnIndex)) continue;

    const body = match[2] ?? "";
    const facts = body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*\u2022\d.)\s]+/, "").trim())
      .filter((line) => line.length > 0);

    if (facts.length > 0) {
      result.push({ turnIndex, facts });
    }
  }

  return result.sort((a, b) => a.turnIndex - b.turnIndex);
}

function buildFallbackFacts(pairs: ConversationPair[]): ExtractedFact[] {
  return pairs
    .map((pair) => {
      const userSummary = summarizeLegacyLine(pair.userText, 120);
      const assistantSummary = summarizeLegacyLine(pair.assistantText, 160);
      const facts = [
        userSummary ? `User: ${userSummary}` : "",
        assistantSummary ? `Character: ${assistantSummary}` : "",
      ].filter(Boolean);

      return { turnIndex: pair.turnIndex, facts };
    })
    .filter((entry) => entry.facts.length > 0);
}

export async function extractFacts(
  pairs: ConversationPair[],
): Promise<ExtractedFact[]> {
  if (pairs.length === 0) return [];

  try {
    const prompt = buildPrompt(pairs);
    const result = await generateText({
      model: openrouter(FACT_EXTRACTION_MODEL),
      prompt,
      temperature: 0.1,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "low" as const },
        },
      },
    });

    const parsed = parseFacts(result.text);
    if (parsed.length === 0) {
      return buildFallbackFacts(pairs);
    }
    return parsed;
  } catch (error) {
    logWarn("fact-extractor: extraction failed, using legacy fallback", error);
    return buildFallbackFacts(pairs);
  }
}
