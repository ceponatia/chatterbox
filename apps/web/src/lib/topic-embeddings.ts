/**
 * Embedding-based topic detection for on_topic segments.
 *
 * Computes cosine similarity between the user's message and each
 * on_topic segment's topic description. Scores are passed to the
 * assembler via AssemblyContext.topicScores as a semantic fallback
 * when keyword matching misses.
 *
 * Uses a lightweight embedding model via OpenRouter.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed, embedMany } from "ai";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Chatterbox" },
});

/** Segment topic descriptions for embedding comparison. */
const SEGMENT_TOPICS: Record<string, string> = {
  appearance_visual: "physical appearance, how someone looks, beauty, face, body, eyes, hair",
  outfit_hairstyle: "clothing, outfit, what someone is wearing, fashion, shoes, hairstyle",
  voice_sound: "voice, singing, music, sound, tone, pitch, speaking voice",
  backstory: "shared history, memories, school days, childhood, reconnecting after time apart",
  relationship_status: "romantic relationship, boyfriend, dating, partner",
};

const EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** Cache segment embeddings since they don't change. */
let segmentEmbeddingsCache: { ids: string[]; vectors: number[][] } | null = null;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function getSegmentEmbeddings(): Promise<{ ids: string[]; vectors: number[][] }> {
  if (segmentEmbeddingsCache) return segmentEmbeddingsCache;

  const ids = Object.keys(SEGMENT_TOPICS);
  const texts = ids.map(id => SEGMENT_TOPICS[id] ?? "");

  const { embeddings } = await embedMany({
    model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
    values: texts,
  });

  segmentEmbeddingsCache = { ids, vectors: embeddings };
  return segmentEmbeddingsCache;
}

/**
 * Compute semantic similarity scores between the user message and
 * each on_topic segment's topic description.
 *
 * Returns a Record<segmentId, score> where score is 0.0–1.0.
 * Returns empty object if embedding fails (graceful degradation).
 */
export async function computeTopicScores(userMessage: string): Promise<Record<string, number>> {
  if (!userMessage.trim()) return {};

  try {
    const [segEmbeddings, messageResult] = await Promise.all([
      getSegmentEmbeddings(),
      embed({
        model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
        value: userMessage,
      }),
    ]);

    const scores: Record<string, number> = {};
    for (let i = 0; i < segEmbeddings.ids.length; i++) {
      const id = segEmbeddings.ids[i];
      const vec = segEmbeddings.vectors[i];
      if (id && vec) {
        scores[id] = cosineSimilarity(messageResult.embedding, vec);
      }
    }
    return scores;
  } catch (err) {
    console.warn("\x1b[33m⚠ topic-embeddings: failed, falling back to keyword-only\x1b[0m", err);
    return {};
  }
}
