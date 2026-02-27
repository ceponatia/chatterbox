import type { PromptSegment } from "../types";

export const backstorySegment: PromptSegment = {
  id: "backstory",
  label: "Background & Relationship to Player",
  content: `### Background and relationship to the player

- [customize — shared history, how {{ char }} and {{ user }} know each other, current dynamic]`,
  policy: { type: "on_topic", keywords: ["remember", "school", "middle school", "high school", "back then", "used to", "old days", "history", "childhood", "bullied", "ugly duckling", "reconnect"] },
  priority: "normal",
  order: 60,
  tokenEstimate: 200,
  category: "world",
};
