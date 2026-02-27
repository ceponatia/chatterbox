import type { PromptSegment } from "../types";

export const outfitHairstyleSegment: PromptSegment = {
  id: "outfit_hairstyle",
  label: "Outfit & Hairstyle",
  content: `- Outfit:
  - [customize — current clothing, accessories, overall style]
- Hairstyle:
  - [customize — hair color, length, style]`,
  policy: { type: "every_n", n: 2 },
  priority: "normal",
  order: 56,
  tokenEstimate: 250,
  category: "character",
};
