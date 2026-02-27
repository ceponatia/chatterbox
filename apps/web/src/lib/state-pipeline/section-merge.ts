/**
 * Per-section specialized merge instructions.
 *
 * Routes extracted facts to section-specific merge guidance based on
 * fact type. This produces a more focused merge instruction than the
 * generic "merge everything" approach, reducing hallucination risk.
 */

import type { ExtractedFact } from "@/lib/state-history";

/** Map fact types to the state section they primarily affect. */
const FACT_SECTION_MAP: Record<string, string> = {
  scene_change: "Scene",
  appearance_change: "Appearance",
  mood_change: "Current Demeanor",
  relationship_shift: "Relationships",
  cast_change: "Cast",
  new_thread: "Open Threads",
  thread_resolved: "Open Threads",
  hard_fact: "Hard Facts",
};

interface SectionMergeGroup {
  section: string;
  facts: ExtractedFact[];
  instruction: string;
}

/** Section-specific merge instructions. */
const SECTION_INSTRUCTIONS: Record<string, string> = {
  Scene: "Overwrite the Scene section with the new scene details. Preserve location names if still relevant.",
  Appearance: "Update appearance details. Only change what the facts describe — preserve all other appearance info.",
  "Current Demeanor": "Update the demeanor to reflect the new mood. Keep it concise — 1-2 sentences.",
  Relationships: "Integrate the relationship shift into existing relationship descriptions. Do not remove existing relationships unless explicitly contradicted.",
  Cast: "Add new characters to the Cast. If a character is already listed, update their description. Do not remove existing cast members.",
  "Open Threads": "Add new threads. If a fact resolves a thread, remove that thread. Keep thread descriptions concise.",
  "Hard Facts": "Append new hard facts. NEVER remove existing hard facts unless explicitly contradicted by a new fact.",
};

/**
 * Group facts by their target section and generate per-section merge instructions.
 * Facts that don't map to a known section go into a "General" group.
 */
export function buildSectionMergeGroups(facts: ExtractedFact[]): SectionMergeGroup[] {
  const groups = new Map<string, ExtractedFact[]>();

  for (const fact of facts) {
    const section = FACT_SECTION_MAP[fact.type] ?? "General";
    const list = groups.get(section);
    if (list) list.push(fact);
    else groups.set(section, [fact]);
  }

  return [...groups.entries()].map(([section, sectionFacts]) => ({
    section,
    facts: sectionFacts,
    instruction: SECTION_INSTRUCTIONS[section] ?? "Integrate these facts into the appropriate section.",
  }));
}

/**
 * Build a structured merge prompt from section groups.
 * This replaces the generic MERGE_INSTRUCTION with per-section guidance.
 */
export function buildSectionMergePrompt(groups: SectionMergeGroup[]): string {
  const parts = [
    "You are a story state editor. Merge the extracted facts into the existing story state.",
    "",
    "RULES:",
    "- Preserve ALL existing content unless a fact explicitly supersedes it.",
    "- Do NOT invent any information beyond what the facts provide.",
    "- Do NOT remove any hard facts unless explicitly contradicted.",
    "- Output ONLY the complete updated Story State block with all 7 sections.",
    "- Keep it under 1200 tokens.",
    "",
    "SECTION-SPECIFIC INSTRUCTIONS:",
  ];

  for (const group of groups) {
    const factLines = group.facts
      .map(f => `  - [${f.type}] ${f.detail} (turn ${f.sourceTurn}, confidence ${f.confidence})`)
      .join("\n");
    parts.push(`\n### ${group.section}`);
    parts.push(group.instruction);
    parts.push(`Facts:\n${factLines}`);
  }

  return parts.join("\n");
}
