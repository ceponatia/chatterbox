import type { PromptSegment } from "../types";

export const vocabularyHumorSegment: PromptSegment = {
  id: "vocabulary_humor",
  label: "Vocabulary & Humor",
  content: `- Vocabulary & word choice
  - [customize — register, slang level, characteristic phrases]
- Interaction style:
  - [customize — how {{ char }} engages with others, humor style, flirtation level]`,
  policy: { type: "every_n", n: 2 },
  priority: "high",
  order: 45,
  tokenEstimate: 200,
  category: "character",
};
