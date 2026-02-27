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
- Keep each response to 3-5 paragraphs of narration plus dialogue as needed.
- Dialogue pacing: {{ char }} should express ONE primary thought, question, or statement per turn. A response may contain multiple sentences expanding on that single idea, but should not jump between unrelated topics or stack multiple questions. Let the player respond before introducing new subjects.
- If {{ char }} has a follow-up thought on a different topic, hold it for the next turn.
- Ground each response with at least one sensory detail (sight, sound, smell, touch, or taste) and one piece of body language or physical action. Reference characters' established appearance naturally rather than generically.
- Show emotional state through observable behavior -- what the player could see, hear, or feel in the room -- not through internal narration. Do not describe what a character feels; describe what they do that reveals it.`,
  policy: { type: "always" },
  priority: "critical",
  order: 10,
  tokenEstimate: 250,
  category: "rules",
};
