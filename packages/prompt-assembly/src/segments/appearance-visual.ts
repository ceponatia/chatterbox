import type { PromptSegment } from "../types";

export const appearanceVisualSegment: PromptSegment = {
  id: "appearance_visual",
  label: "Appearance & Visual Presence",
  content: `- Look/Presence:
  - [customize — build, height, notable physical features]
  - [customize — overall vibe, energy, how they carry themselves]`,
  policy: { type: "every_n", n: 2 },
  priority: "normal",
  order: 55,
  tokenEstimate: 300,
  category: "character",
};
