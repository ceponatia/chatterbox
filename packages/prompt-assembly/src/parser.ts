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

import type {
  PromptSegment,
  InjectionPolicy,
  SerializedSegment,
  SerializedPolicy,
} from "./types";
import { estimateTokens } from "./token-estimator";
import { PromptAssembler } from "./assembler";
import {
  HEADING_MAPPINGS,
  SUB_SECTION_MAPPINGS,
  MERGE_GROUPS,
  type HeadingMapping,
  type SubSectionMapping,
} from "./parser-mappings";

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

/** Apply a single merge group: combine matching sub-segments into one. */
function applyMergeGroup(
  segments: SerializedSegment[],
  sourceIds: readonly string[],
  merged: Omit<SerializedSegment, "content" | "tokenEstimate">,
): SerializedSegment[] {
  const sources = segments.filter((s) => sourceIds.includes(s.id));
  if (sources.length === 0) return segments;

  const rest = segments.filter((s) => !sourceIds.includes(s.id));
  const content = sources.map((s) => s.content).join("\n");
  rest.push({
    ...merged,
    content,
    tokenEstimate: sources.reduce((sum, s) => sum + s.tokenEstimate, 0),
  });
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
  const allSections = splitByHeadings(markdown);
  const segments: SerializedSegment[] = [];
  let unknownCounter = 0;

  // The first section (before any heading) is typically the core rules
  const hasLeadingContent =
    allSections.length > 0 && allSections[0]!.heading === "";
  const sections = hasLeadingContent ? allSections.slice(1) : allSections;

  if (hasLeadingContent) {
    const first = allSections[0]!;
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

  let result = segments;
  for (const group of MERGE_GROUPS) {
    result = applyMergeGroup(result, group.sourceIds, group.merged);
  }
  return result.sort((a, b) => a.order - b.order);
}

/**
 * Convert a SerializedSegment array back into a flat markdown string.
 * Useful for displaying the "assembled" view or for backward compatibility.
 */
export function segmentsToMarkdown(
  segments: readonly SerializedSegment[],
): string {
  return [...segments]
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
