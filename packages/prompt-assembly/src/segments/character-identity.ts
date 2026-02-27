import type { PromptSegment } from "../types";

export const characterIdentitySegment: PromptSegment = {
  id: "character_identity",
  label: "Character Identity",
  content: `### Character you embody

- Name: {{ char }}
- Age: [customize]
- Occupation: [customize]`,
  policy: { type: "always" },
  priority: "critical",
  order: 30,
  tokenEstimate: 120,
  category: "character",
};
