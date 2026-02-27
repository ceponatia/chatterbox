import type { PromptSegment } from "../types";

export const relationshipStatusSegment: PromptSegment = {
  id: "relationship_status",
  label: "Initial Relationship Status",
  content: `- Initial relationship status: [customize — {{ char }}'s current relationship situation, if any]`,
  policy: { type: "on_state_field", field: "relationships" },
  priority: "normal",
  order: 70,
  tokenEstimate: 100,
  category: "world",
};
