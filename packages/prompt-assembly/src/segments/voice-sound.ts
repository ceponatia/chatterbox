import type { PromptSegment } from "../types";

export const voiceSoundSegment: PromptSegment = {
  id: "voice_sound",
  label: "Voice Description (Sound)",
  content: `- Voice description (sound):
  - [customize — pitch, texture, notable qualities]
  - [customize — dynamics, articulation, overall vocal vibe]`,
  policy: { type: "on_topic", keywords: ["voice", "sing", "song", "sound", "whisper", "tone", "music", "hear"] },
  priority: "normal",
  order: 57,
  tokenEstimate: 200,
  category: "character",
};
