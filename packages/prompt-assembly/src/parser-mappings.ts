/**
 * Heading and sub-section mapping data for the system prompt parser.
 *
 * These static configuration tables define how markdown headings and
 * bullet-prefixed sub-sections map to known segment IDs, policies, and
 * metadata. Extracted from parser.ts for readability.
 */

import type {
  SerializedPolicy,
  SerializedSegment,
  SegmentPriority,
} from "./types";

// ---------------------------------------------------------------------------
// Heading → segment mapping
// ---------------------------------------------------------------------------

export interface HeadingMapping {
  /** Regex pattern to match against the heading text (case-insensitive) */
  pattern: RegExp;
  id: string;
  label: string;
  policy: SerializedPolicy;
  priority: SegmentPriority;
  order: number;
  category: string;
  /** If true, the heading line itself is included in the content */
  includeHeading: boolean;
}

/**
 * Ordered list of heading patterns. The parser walks through the markdown
 * and assigns each section to the first matching pattern.
 *
 * Patterns are matched against the heading text (without the `#` prefix).
 */
export const HEADING_MAPPINGS: readonly HeadingMapping[] = [
  {
    pattern: /^system\s+prompt/i,
    id: "core_rules",
    label: "Core Narration Rules",
    policy: { type: "always" },
    priority: "critical",
    order: 0,
    category: "rules",
    includeHeading: false,
  },
  {
    pattern: /^output\s+format/i,
    id: "output_format",
    label: "Output Format",
    policy: { type: "always" },
    priority: "critical",
    order: 10,
    category: "rules",
    includeHeading: true,
  },
  {
    pattern: /^setting\s+(and\s+)?scope/i,
    id: "setting_premise",
    label: "Setting & Premise",
    policy: { type: "always" },
    priority: "critical",
    order: 20,
    category: "world",
    includeHeading: true,
  },
  {
    pattern: /^character\s+you\s+embody/i,
    id: "character_identity",
    label: "Character Identity",
    policy: { type: "always" },
    priority: "critical",
    order: 30,
    category: "character",
    includeHeading: true,
  },
  {
    pattern: /^background\s+and\s+relationship/i,
    id: "backstory",
    label: "Background & Relationship to Player",
    policy: {
      type: "on_topic",
      keywords: [
        "remember",
        "school",
        "middle school",
        "high school",
        "back then",
        "used to",
        "old days",
        "history",
        "childhood",
        "bullied",
        "ugly duckling",
        "reconnect",
      ],
    },
    priority: "normal",
    order: 60,
    category: "world",
    includeHeading: true,
  },
  {
    pattern: /^interaction\s+guidelines/i,
    id: "interaction_guide",
    label: "Interaction Guidelines",
    policy: { type: "every_n", n: 3 },
    priority: "normal",
    order: 65,
    category: "character",
    includeHeading: true,
  },
];

// ---------------------------------------------------------------------------
// Sub-section patterns (within character identity block)
// ---------------------------------------------------------------------------

export interface SubSectionMapping {
  /** Regex matched against the line that starts the sub-section */
  startPattern: RegExp;
  /** Regex that, if matched, means we've left this sub-section */
  endPatterns: RegExp[];
  id: string;
  label: string;
  policy: SerializedPolicy;
  priority: SegmentPriority;
  order: number;
  category: string;
}

export const SUB_SECTION_MAPPINGS: readonly SubSectionMapping[] = [
  {
    startPattern: /^-\s*speech\s+patterns?\s+(and\s+)?voice/i,
    endPatterns: [
      /^-\s*vocabulary/i,
      /^-\s*signature/i,
      /^-\s*mannerisms/i,
      /^-\s*interaction/i,
      /^-\s*technique/i,
      /^-\s*voice\s+description/i,
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "speech_patterns",
    label: "Speech Patterns & Voice",
    policy: { type: "every_n", n: 2 },
    priority: "high",
    order: 40,
    category: "character",
  },
  {
    startPattern: /^-\s*vocabulary\s*&?\s*word\s+choice/i,
    endPatterns: [
      /^-\s*mannerisms/i,
      /^-\s*interaction/i,
      /^-\s*technique/i,
      /^-\s*voice\s+description/i,
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "vocabulary_humor_a",
    label: "Vocabulary & Word Choice",
    policy: { type: "every_n", n: 2 },
    priority: "high",
    order: 45,
    category: "character",
  },
  {
    startPattern: /^-\s*signature\s+moves/i,
    endPatterns: [
      /^-\s*mannerisms/i,
      /^-\s*interaction/i,
      /^-\s*technique/i,
      /^-\s*voice\s+description/i,
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "vocabulary_humor_b",
    label: "Signature Moves",
    policy: { type: "every_n", n: 2 },
    priority: "high",
    order: 46,
    category: "character",
  },
  {
    startPattern: /^-\s*interaction\s+style/i,
    endPatterns: [
      /^-\s*mannerisms/i,
      /^-\s*voice\s+description/i,
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "vocabulary_humor_c",
    label: "Interaction Style & Technique",
    policy: { type: "every_n", n: 2 },
    priority: "high",
    order: 47,
    category: "character",
  },
  {
    startPattern: /^-\s*technique/i,
    endPatterns: [
      /^-\s*mannerisms/i,
      /^-\s*voice\s+description/i,
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "vocabulary_humor_d",
    label: "Technique",
    policy: { type: "every_n", n: 2 },
    priority: "high",
    order: 48,
    category: "character",
  },
  {
    startPattern: /^-\s*look\s*\/?\s*presence/i,
    endPatterns: [
      /^-\s*speech/i,
      /^-\s*vocabulary/i,
      /^-\s*signature/i,
      /^-\s*mannerisms/i,
      /^-\s*interaction/i,
      /^-\s*technique/i,
      /^-\s*voice\s+description/i,
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "appearance_visual",
    label: "Appearance & Visual Presence",
    policy: {
      type: "on_topic",
      keywords: [
        "look",
        "appearance",
        "pretty",
        "beautiful",
        "cute",
        "face",
        "eyes",
        "hair",
        "body",
        "tall",
        "short",
        "petite",
        "what she looks like",
      ],
    },
    priority: "normal",
    order: 55,
    category: "character",
  },
  {
    startPattern: /^-\s*mannerisms/i,
    endPatterns: [
      /^-\s*interaction\s+style/i,
      /^-\s*technique/i,
      /^-\s*voice\s+description/i,
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "mannerisms",
    label: "Mannerisms & Physical Beats",
    policy: { type: "every_n", n: 3 },
    priority: "normal",
    order: 50,
    category: "character",
  },
  {
    startPattern: /^-\s*voice\s+description/i,
    endPatterns: [
      /^-\s*outfit/i,
      /^-\s*hairstyle/i,
      /^-\s*initial\s+relationship/i,
      /^###/,
    ],
    id: "voice_sound",
    label: "Voice Description (Sound)",
    policy: {
      type: "on_topic",
      keywords: [
        "voice",
        "sing",
        "song",
        "sound",
        "whisper",
        "tone",
        "music",
        "hear",
      ],
    },
    priority: "normal",
    order: 57,
    category: "character",
  },
  {
    startPattern: /^-\s*outfit/i,
    endPatterns: [/^-\s*hairstyle/i, /^-\s*initial\s+relationship/i, /^###/],
    id: "outfit_hairstyle_a",
    label: "Outfit",
    policy: {
      type: "on_topic",
      keywords: [
        "outfit",
        "wear",
        "clothes",
        "dress",
        "shirt",
        "jacket",
        "blazer",
        "shoes",
        "heels",
      ],
    },
    priority: "normal",
    order: 58,
    category: "character",
  },
  {
    startPattern: /^-\s*hairstyle/i,
    endPatterns: [/^-\s*initial\s+relationship/i, /^###/],
    id: "outfit_hairstyle_b",
    label: "Hairstyle",
    policy: { type: "on_topic", keywords: ["hairstyle", "styled", "hair"] },
    priority: "normal",
    order: 59,
    category: "character",
  },
  {
    startPattern: /^-\s*initial\s+relationship\s+status/i,
    endPatterns: [/^###/],
    id: "relationship_status",
    label: "Initial Relationship Status",
    policy: { type: "on_state_field", field: "relationships" },
    priority: "normal",
    order: 70,
    category: "world",
  },
];

// ---------------------------------------------------------------------------
// Merge group definitions
// ---------------------------------------------------------------------------

/** Descriptor for merging multiple parsed sub-segments into one. */
export interface MergeGroupDef {
  sourceIds: readonly string[];
  merged: Omit<SerializedSegment, "content" | "tokenEstimate">;
}

export const MERGE_GROUPS: readonly MergeGroupDef[] = [
  {
    sourceIds: [
      "vocabulary_humor_a",
      "vocabulary_humor_b",
      "vocabulary_humor_c",
      "vocabulary_humor_d",
    ],
    merged: {
      id: "vocabulary_humor",
      label: "Vocabulary & Humor",
      policy: { type: "every_n", n: 2 },
      priority: "high",
      order: 45,
      category: "character",
    },
  },
  {
    sourceIds: ["outfit_hairstyle_a", "outfit_hairstyle_b"],
    merged: {
      id: "outfit_hairstyle",
      label: "Outfit & Hairstyle",
      policy: {
        type: "on_topic",
        keywords: [
          "outfit",
          "wear",
          "clothes",
          "dress",
          "shirt",
          "jacket",
          "blazer",
          "shoes",
          "heels",
          "hairstyle",
          "styled",
          "hair",
        ],
      },
      priority: "normal",
      order: 56,
      category: "character",
    },
  },
];
