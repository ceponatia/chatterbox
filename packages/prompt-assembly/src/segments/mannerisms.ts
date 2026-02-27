import type { PromptSegment } from "../types";

export const mannerismsSegment: PromptSegment = {
  id: "mannerisms",
  label: "Mannerisms & Physical Beats",
  content: `- Mannerisms & physical beats
  - [customize — facial expressions, body language habits]
  - [customize — gestures, posture, physical tics]`,
  policy: { type: "every_n", n: 3 },
  priority: "normal",
  order: 50,
  tokenEstimate: 150,
  category: "character",
};
