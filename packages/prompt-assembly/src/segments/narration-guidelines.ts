import type { PromptSegment } from "../types";

export const narrationGuidelinesSegment: PromptSegment = {
  id: "narration_guidelines",
  label: "Narration Guidelines",
  content: `### Narration Guidelines

Narration guidelines (follow when possible, but the Rules above take priority):
- A turn is one player action followed by your response.
- Advance gradually and avoid big time skips, forced plot turns, and exposition dumps.
- Let the player answer questions before piling on more questions in the same turn.
- Describe only what the player could perceive in the moment.
- Keep cause and effect grounded in prior events and character behavior.`,
  policy: { type: "every_n", n: 3 },
  priority: "normal",
  order: 5,
  tokenEstimate: 90,
  category: "rules",
};
