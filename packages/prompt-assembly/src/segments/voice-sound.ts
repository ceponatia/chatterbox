import type { PromptSegment } from "../types";

export const voiceSoundSegment: PromptSegment = {
  id: "voice_sound",
  label: "Voice Description (Sound)",
  content: `- Voice description (sound):
  - [customize — pitch, texture, notable qualities]
  - [customize — dynamics, articulation, overall vocal vibe]`,
  policy: { type: "every_n", n: 2 },
  priority: "normal",
  order: 57,
  tokenEstimate: 200,
  category: "character",
};
