/**
 * Lightweight token estimation.
 *
 * Uses a character-based heuristic (~4 chars per token for English text).
 * Good enough for budget enforcement; not meant to replace a real tokenizer.
 */

const CHARS_PER_TOKEN = 4;

/** Estimate token count from a string. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
