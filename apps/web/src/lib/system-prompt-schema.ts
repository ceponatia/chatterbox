/**
 * Schema-driven definitions for the system prompt editor.
 * Mirrors the pattern in character-schema.ts but for story-level segments.
 *
 * Each section maps to one or more segment IDs. The editor renders fields
 * whose values are stored as `segmentOverrides` on the StoryProject and
 * applied during segment generation.
 */

export interface PromptFieldDefinition {
  /** Key used as the segment ID in segmentOverrides. */
  key: string;
  label: string;
  type: "text" | "textarea";
  /** Placeholder shown when the field is empty. */
  placeholder: string;
  /** Tooltip describing the field purpose. */
  tooltip: string;
  /** Default content (from the default segment). */
  defaultContent: string;
}

export interface PromptSectionDefinition {
  id: string;
  label: string;
  description: string;
  /** Whether this section starts collapsed. */
  collapsed: boolean;
  fields: PromptFieldDefinition[];
}

/* ---------------------------------------------------------------------------
 * Default content extracted from the default segments in
 * @chatterbox/prompt-assembly. These match the segment content used when
 * no importedSystemPrompt is present.
 * -------------------------------------------------------------------------*/

const DEFAULT_SETTING_PREMISE = `### Setting and scope

- Tone: [customize]
- Premise: [customize]`;

const DEFAULT_NARRATION_GUIDELINES = `### Narration Guidelines

Narration guidelines (follow when possible, but the Rules above take priority):
- A turn is one player action followed by your response.
- Advance gradually and avoid big time skips, forced plot turns, and exposition dumps.
- Let the player answer questions before piling on more questions in the same turn.
- Describe only what the player could perceive in the moment.
- Keep cause and effect grounded in prior events and character behavior.`;

const DEFAULT_INTERACTION_GUIDE = `### Interaction guidelines

- NPCs speak like real people: short lines, interruptions, laughter, deflections, and occasional vulnerability.
- NPCs do not overshare immediately; intimacy builds with earned trust.
- One beat per turn: each response is one conversational beat. {{ char }} reacts to the player's action, then says or does one thing. Do not front-load multiple conversation topics, questions, or revelations into a single response.
- Think of pacing like a real conversation: people respond to what was just said, add one thought, then wait. They do not deliver monologues covering three different subjects.
- When {{ user }} and {{ char }} are not in the same location, only narrate for {{ char }} and other NPCs. Do not describe {{ user }}'s actions or thoughts.`;

const DEFAULT_OUTPUT_FORMAT = `### Output format

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
- Show emotional state through observable behavior -- what the player could see, hear, or feel in the room -- not through internal narration. Do not describe what a character feels; describe what they do that reveals it.`;

/* ---------------------------------------------------------------------------
 * Section definitions
 * -------------------------------------------------------------------------*/

export const SYSTEM_PROMPT_SECTIONS: readonly PromptSectionDefinition[] = [
  {
    id: "world",
    label: "World & Setting",
    description:
      "Tone, premise, and starting situation for the story. This is always included in the prompt.",
    collapsed: false,
    fields: [
      {
        key: "setting_premise",
        label: "Setting & Premise",
        type: "textarea",
        placeholder:
          "Describe the tone and premise. For example:\n- Tone: contemporary slice-of-life\n- Premise: Two roommates navigating life after college.",
        tooltip:
          "The overall setting, tone, and starting situation. Use {{ char }} and {{ user }} as character placeholders.",
        defaultContent: DEFAULT_SETTING_PREMISE,
      },
    ],
  },
  {
    id: "interaction",
    label: "Interaction Guidelines",
    description:
      "How NPCs behave in conversation. Included periodically to reinforce pacing.",
    collapsed: false,
    fields: [
      {
        key: "interaction_guide",
        label: "Interaction guidelines",
        type: "textarea",
        placeholder:
          "How should NPCs interact? Describe conversational style, pacing rules, and social behavior.",
        tooltip:
          "Controls NPC conversation pacing, intimacy building, and beat-per-turn behavior.",
        defaultContent: DEFAULT_INTERACTION_GUIDE,
      },
    ],
  },
  {
    id: "narration",
    label: "Narration Guidelines",
    description:
      "General narration pacing and style rules. Included periodically.",
    collapsed: true,
    fields: [
      {
        key: "narration_guidelines",
        label: "Narration guidelines",
        type: "textarea",
        placeholder:
          "Narration pacing, time-skip policy, and how to handle cause and effect.",
        tooltip:
          "Guidelines for how narration advances the story turn by turn.",
        defaultContent: DEFAULT_NARRATION_GUIDELINES,
      },
    ],
  },
  {
    id: "format",
    label: "Output Format",
    description:
      "Response structure and formatting rules. Included on every turn.",
    collapsed: true,
    fields: [
      {
        key: "output_format",
        label: "Output format",
        type: "textarea",
        placeholder:
          "Response formatting: tense, paragraph structure, dialogue pacing, sensory grounding rules.",
        tooltip:
          "Controls how the model formats its responses -- paragraph count, tense, dialogue structure.",
        defaultContent: DEFAULT_OUTPUT_FORMAT,
      },
    ],
  },
];

/**
 * Returns default overrides record populated with all editable segment defaults.
 * Useful for initializing a new story project.
 */
export function getDefaultSegmentOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const section of SYSTEM_PROMPT_SECTIONS) {
    for (const field of section.fields) {
      overrides[field.key] = field.defaultContent;
    }
  }
  return overrides;
}
