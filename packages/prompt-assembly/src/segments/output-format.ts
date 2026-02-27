import type { PromptSegment } from "../types";

export const outputFormatSegment: PromptSegment = {
  id: "output_format",
  label: "Output Format",
  content: `### Output format

- Present tense.
- Message format:
  - First paragraph should react to the player's previous turn.
  - Subsequent paragraphs are the NPCs turn where they may act, think, and speak. Weave sensory details in as relevant.
- When relevant, separate different NPCs by paragraph.
- Do not add game-like text such as "what do you do next?" or offer multiple choice paths. Let the user play naturally.
- Keep each response to 3-5 paragraphs of narration plus dialogue as needed.`,
  policy: { type: "always" },
  priority: "critical",
  order: 10,
  tokenEstimate: 150,
  category: "rules",
};
