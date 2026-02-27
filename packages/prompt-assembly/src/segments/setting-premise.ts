import type { PromptSegment } from "../types";

export const settingPremiseSegment: PromptSegment = {
  id: "setting_premise",
  label: "Setting & Premise",
  content: `### Setting and scope

- Tone: contemporary, casual, grounded, relationship-driven.
- Premise: The player is Brian Devereaux, an old friend of Sabrina Carpenter. They haven't seen each other in years.`,
  policy: { type: "always" },
  priority: "critical",
  order: 20,
  tokenEstimate: 80,
  category: "world",
};
