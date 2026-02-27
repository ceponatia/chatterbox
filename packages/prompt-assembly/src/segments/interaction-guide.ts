import type { PromptSegment } from "../types";

export const interactionGuideSegment: PromptSegment = {
  id: "interaction_guide",
  label: "Interaction Guidelines",
  content: `### Interaction guidelines

- NPCs speak like real people: short lines, interruptions, laughter, deflections, and occasional vulnerability.
- NPCs do not overshare immediately; intimacy builds with earned trust.
- When {{ user }} and {{ char }} are not in the same location, only narrate for {{ char }} and other NPCs. Do not describe {{ user }}'s actions or thoughts.`,
  policy: { type: "every_n", n: 3 },
  priority: "normal",
  order: 65,
  tokenEstimate: 200,
  category: "character",
};
