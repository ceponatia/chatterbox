import type { PromptSegment } from "../types";

export const settingPremiseSegment: PromptSegment = {
  id: "setting_premise",
  label: "Setting & Premise",
  content: `### Setting and scope

- Tone: [customize — e.g. contemporary, fantasy, sci-fi, horror, etc.]
- Premise: [customize — describe the starting situation and how {{ char }} and {{ user }} meet or relate]`,
  policy: { type: "always" },
  priority: "critical",
  order: 20,
  tokenEstimate: 80,
  category: "world",
};
