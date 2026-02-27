/**
 * System prompt markdown parser.
 *
 * Parses a monolithic system prompt markdown file into SerializedSegment
 * objects by matching heading patterns and content blocks to known segment
 * IDs. Unknown sections are captured as generic segments.
 *
 * This enables the UI to show users exactly what the assembler will work
 * with after an import, rather than displaying raw file content.
 */

import type { PromptSegment, InjectionPolicy, SegmentPriority } from "./types";
import { estimateTokens } from "./token-estimator";
import { PromptAssembler } from "./assembler";

// ---------------------------------------------------------------------------
// SerializedSegment — JSON-safe representation for storage/transport
// ---------------------------------------------------------------------------

export type SerializedPolicy =
  | { type: "always" }
  | { type: "every_n"; n: number }
  | { type: "on_topic"; keywords: string[] }
  | { type: "on_state_field"; field: string };

export interface SerializedSegment {
  id: string;
  label: string;
  content: string;
  policy: SerializedPolicy;
  priority: SegmentPriority;
  order: number;
  tokenEstimate: number;
  category: string;
}

// ---------------------------------------------------------------------------
// Heading → segment mapping
// ---------------------------------------------------------------------------

interface HeadingMapping {
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
const HEADING_MAPPINGS: readonly HeadingMapping[] = [
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

/**
 * Sub-section patterns matched within the character identity block.
 * These are matched against bullet-point prefixes or sub-headings within
 * a larger section (typically under "### Character you embody").
 */
interface SubSectionMapping {
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

const SUB_SECTION_MAPPINGS: readonly SubSectionMapping[] = [
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
// Parser implementation
// ---------------------------------------------------------------------------

interface ParsedSection {
  heading: string;
  headingLevel: number;
  content: string;
  startLine: number;
}

/** Split markdown into sections by heading. */
function splitByHeadings(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentLines: string[] = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      // Save previous section
      if (currentLines.length > 0 || currentHeading) {
        sections.push({
          heading: currentHeading,
          headingLevel: currentLevel,
          content: currentLines.join("\n").trim(),
          startLine,
        });
      }
      currentHeading = headingMatch[2]!.trim();
      currentLevel = headingMatch[1]!.length;
      currentLines = [];
      startLine = i;
    } else {
      currentLines.push(line);
    }
  }

  // Final section
  if (currentLines.length > 0 || currentHeading) {
    sections.push({
      heading: currentHeading,
      headingLevel: currentLevel,
      content: currentLines.join("\n").trim(),
      startLine,
    });
  }

  return sections;
}

/** Try to match a section to a known heading mapping. */
function matchHeading(heading: string): HeadingMapping | undefined {
  return HEADING_MAPPINGS.find((m) => m.pattern.test(heading));
}

/**
 * Parse the content of a character block into sub-sections using bullet
 * patterns. Returns matched sub-sections and any remaining content that
 * didn't match a known sub-section.
 */
function parseCharacterSubSections(content: string): {
  matched: { mapping: SubSectionMapping; content: string }[];
  preamble: string;
} {
  const lines = content.split("\n");
  const matched: { mapping: SubSectionMapping; content: string }[] = [];
  const preambleLines: string[] = [];
  let activeMapping: SubSectionMapping | undefined;
  let activeLines: string[] = [];

  function flushActive() {
    if (activeMapping && activeLines.length > 0) {
      matched.push({
        mapping: activeMapping,
        content: activeLines.join("\n").trim(),
      });
    }
    activeMapping = undefined;
    activeLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Check if this line starts a new sub-section
    const newMapping = SUB_SECTION_MAPPINGS.find((m) =>
      m.startPattern.test(trimmed),
    );
    if (newMapping) {
      flushActive();
      activeMapping = newMapping;
      activeLines.push(line);
      continue;
    }

    // Check if this line ends the current sub-section
    if (activeMapping) {
      const isEnd = activeMapping.endPatterns.some((p) => p.test(trimmed));
      if (isEnd) {
        flushActive();
        // Re-check if this line starts another sub-section
        const restartMapping = SUB_SECTION_MAPPINGS.find((m) =>
          m.startPattern.test(trimmed),
        );
        if (restartMapping) {
          activeMapping = restartMapping;
          activeLines.push(line);
        } else {
          preambleLines.push(line);
        }
        continue;
      }
      activeLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  flushActive();

  return { matched, preamble: preambleLines.join("\n").trim() };
}

/** Merge adjacent vocabulary/humor sub-segments back into one segment. */
function mergeVocabularyHumor(
  segments: SerializedSegment[],
): SerializedSegment[] {
  const vocabIds = [
    "vocabulary_humor_a",
    "vocabulary_humor_b",
    "vocabulary_humor_c",
    "vocabulary_humor_d",
  ];
  const vocabSegments = segments.filter((s) => vocabIds.includes(s.id));
  const rest = segments.filter((s) => !vocabIds.includes(s.id));

  if (vocabSegments.length === 0) return segments;

  const merged: SerializedSegment = {
    id: "vocabulary_humor",
    label: "Vocabulary & Humor",
    content: vocabSegments.map((s) => s.content).join("\n"),
    policy: { type: "every_n", n: 2 },
    priority: "high",
    order: 45,
    tokenEstimate: vocabSegments.reduce((sum, s) => sum + s.tokenEstimate, 0),
    category: "character",
  };

  rest.push(merged);
  rest.sort((a, b) => a.order - b.order);
  return rest;
}

/** Merge adjacent outfit/hairstyle sub-segments back into one segment. */
function mergeOutfitHairstyle(
  segments: SerializedSegment[],
): SerializedSegment[] {
  const ids = ["outfit_hairstyle_a", "outfit_hairstyle_b"];
  const matched = segments.filter((s) => ids.includes(s.id));
  const rest = segments.filter((s) => !ids.includes(s.id));

  if (matched.length === 0) return segments;

  const merged: SerializedSegment = {
    id: "outfit_hairstyle",
    label: "Outfit & Hairstyle",
    content: matched.map((s) => s.content).join("\n"),
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
    tokenEstimate: matched.reduce((sum, s) => sum + s.tokenEstimate, 0),
    category: "character",
  };

  rest.push(merged);
  rest.sort((a, b) => a.order - b.order);
  return rest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Process a character identity section into identity + sub-section segments. */
function processCharacterSection(
  section: ParsedSection,
  mapping: HeadingMapping,
): SerializedSegment[] {
  const results: SerializedSegment[] = [];
  const { matched: subSections, preamble } = parseCharacterSubSections(
    section.content,
  );

  const identityContent = mapping.includeHeading
    ? `### ${section.heading}\n\n${preamble}`
    : preamble;

  if (identityContent.trim()) {
    results.push({
      id: mapping.id,
      label: mapping.label,
      content: identityContent.trim(),
      policy: mapping.policy,
      priority: mapping.priority,
      order: mapping.order,
      tokenEstimate: estimateTokens(identityContent),
      category: mapping.category,
    });
  }

  for (const sub of subSections) {
    results.push({
      id: sub.mapping.id,
      label: sub.mapping.label,
      content: sub.content.trim(),
      policy: sub.mapping.policy,
      priority: sub.mapping.priority,
      order: sub.mapping.order,
      tokenEstimate: estimateTokens(sub.content),
      category: sub.mapping.category,
    });
  }
  return results;
}

/** Process a known (non-character) heading section into a segment. */
function processKnownSection(
  section: ParsedSection,
  mapping: HeadingMapping,
): SerializedSegment {
  const fullContent = mapping.includeHeading
    ? `### ${section.heading}\n\n${section.content}`
    : section.content;

  return {
    id: mapping.id,
    label: mapping.label,
    content: fullContent.trim(),
    policy: mapping.policy,
    priority: mapping.priority,
    order: mapping.order,
    tokenEstimate: estimateTokens(fullContent),
    category: mapping.category,
  };
}

export function parseSystemPromptToSegments(
  markdown: string,
): SerializedSegment[] {
  const sections = splitByHeadings(markdown);
  const segments: SerializedSegment[] = [];
  let unknownCounter = 0;

  // The first section (before any heading) is typically the core rules
  if (sections.length > 0 && sections[0]!.heading === "") {
    const first = sections[0]!;
    if (first.content.trim()) {
      segments.push({
        id: "core_rules",
        label: "Core Narration Rules",
        content: first.content.trim(),
        policy: { type: "always" },
        priority: "critical",
        order: 0,
        tokenEstimate: estimateTokens(first.content),
        category: "rules",
      });
    }
    sections.shift();
  }

  for (const section of sections) {
    const mapping = matchHeading(section.heading);

    if (mapping) {
      if (mapping.id === "character_identity") {
        segments.push(...processCharacterSection(section, mapping));
      } else {
        segments.push(processKnownSection(section, mapping));
      }
    } else {
      unknownCounter++;
      const fullContent = `### ${section.heading}\n\n${section.content}`;
      segments.push({
        id: `custom_${unknownCounter}`,
        label: section.heading,
        content: fullContent.trim(),
        policy: { type: "always" },
        priority: "normal",
        order: 80 + unknownCounter,
        tokenEstimate: estimateTokens(fullContent),
        category: "custom",
      });
    }
  }

  let result = mergeVocabularyHumor(segments);
  result = mergeOutfitHairstyle(result);
  return result.sort((a, b) => a.order - b.order);
}

/**
 * Convert a SerializedSegment array back into a flat markdown string.
 * Useful for displaying the "assembled" view or for backward compatibility.
 */
export function segmentsToMarkdown(segments: SerializedSegment[]): string {
  return segments
    .sort((a, b) => a.order - b.order)
    .map((s) => s.content)
    .join("\n\n");
}

/** Convert a SerializedPolicy to a runtime InjectionPolicy. */
function deserializePolicy(sp: SerializedPolicy): InjectionPolicy {
  switch (sp.type) {
    case "always":
      return { type: "always" };
    case "every_n":
      return { type: "every_n", n: sp.n };
    case "on_topic":
      return { type: "on_topic", keywords: sp.keywords };
    case "on_state_field":
      return { type: "on_state_field", field: sp.field };
  }
}

/** Convert a SerializedSegment to a runtime PromptSegment. */
export function deserializeSegment(ss: SerializedSegment): PromptSegment {
  return {
    id: ss.id,
    label: ss.label,
    content: ss.content,
    policy: deserializePolicy(ss.policy),
    priority: ss.priority,
    order: ss.order,
    tokenEstimate: ss.tokenEstimate,
    category: ss.category,
  };
}

/** Create a PromptAssembler pre-loaded with the given serialized segments. */
export function createAssemblerFromSerialized(
  segments: SerializedSegment[],
): PromptAssembler {
  const assembler = new PromptAssembler();
  for (const ss of segments) {
    assembler.register(deserializeSegment(ss));
  }
  return assembler;
}
