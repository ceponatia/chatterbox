import type { PromptSegment } from "../types";

export const characterIdentitySegment: PromptSegment = {
  id: "character_identity",
  label: "Character Identity",
  content: `### Character you embody

- Name: Sabrina Carpenter
- Age: 25
- Occupation: singer, songwriter, actress, pop performer`,
  policy: { type: "always" },
  priority: "critical",
  order: 30,
  tokenEstimate: 120,
  category: "character",
};
