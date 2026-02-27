/**
 * Topic detection for on_topic injection policy.
 *
 * Uses word-boundary-aware keyword matching with basic suffix stripping
 * for better recall (e.g. "singing" matches keyword "sing").
 *
 * Future: embedding-based semantic similarity (Phase 5).
 */

/**
 * Strip common English suffixes to improve keyword recall.
 * Not a full stemmer — just handles the most common verb/noun forms.
 */
const SUFFIX_RULES: readonly { suffix: string; minLen: number; cut: number }[] = [
  { suffix: "ing", minLen: 6, cut: 3 },
  { suffix: "tion", minLen: 7, cut: 4 },
  { suffix: "ed", minLen: 5, cut: 2 },
  { suffix: "ly", minLen: 5, cut: 2 },
  { suffix: "es", minLen: 5, cut: 2 },
  { suffix: "s", minLen: 4, cut: 1 },
];

function basicStem(word: string): string {
  for (const rule of SUFFIX_RULES) {
    if (word.length >= rule.minLen && word.endsWith(rule.suffix)) {
      return word.slice(0, -rule.cut);
    }
  }
  return word;
}

/** Tokenize text into lowercase words. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/** Returns true if any keyword matches a word in the message (with stemming). */
export function matchesTopicKeywords(
  message: string,
  keywords: readonly string[],
): boolean {
  const words = tokenize(message);
  const stems = words.map(basicStem);

  return keywords.some(kw => {
    const kwLower = kw.toLowerCase();
    // Multi-word phrases: check substring (e.g. "what she looks like")
    if (kwLower.includes(" ")) return message.toLowerCase().includes(kwLower);
    // Single word: check exact word match OR stem match
    const kwStem = basicStem(kwLower);
    return words.includes(kwLower) || stems.includes(kwStem);
  });
}
