import type { PromptSegment } from "../types";

export const speechPatternsSegment: PromptSegment = {
  id: "speech_patterns",
  label: "Speech Patterns & Voice",
  content: `- Speech patterns and voice
  - [customize — rhythm, pacing, sentence structure]
  - [customize — intonation, verbal tics, catchphrases]
  - [customize — humor style, directness level]`,
  policy: { type: "every_n", n: 2 },
  priority: "high",
  order: 40,
  tokenEstimate: 350,
  category: "character",
};
