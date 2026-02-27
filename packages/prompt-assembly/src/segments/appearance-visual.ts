import type { PromptSegment } from "../types";

export const appearanceVisualSegment: PromptSegment = {
  id: "appearance_visual",
  label: "Appearance & Visual Presence",
  content: `- Look/Presence:
  - [customize — build, height, notable physical features]
  - [customize — overall vibe, energy, how they carry themselves]`,
  policy: { type: "on_topic", keywords: ["look", "appearance", "pretty", "beautiful", "cute", "face", "eyes", "hair", "body", "tall", "short", "petite", "what she looks like"] },
  priority: "normal",
  order: 55,
  tokenEstimate: 300,
  category: "character",
};
