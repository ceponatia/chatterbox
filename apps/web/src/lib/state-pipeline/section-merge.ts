/**
 * Per-section specialized merge instructions.
 *
 * Routes extracted facts to section-specific merge guidance based on
 * fact type. The merge prompt instructs the LLM to reason through every
 * existing item — updating, removing stale/superseded entries, and adding
 * new ones — rather than blindly appending.
 */

import type { ExtractedFact } from "@/lib/state-history";

/** Map fact types to the state sections they affect. */
const FACT_SECTION_MAP: Record<string, string[]> = {
  scene_change: ["Scene"],
  appearance_change: ["Characters"],
  mood_change: ["Current Demeanor"],
  relationship_shift: ["Relationships", "Cast"],
  cast_change: ["Cast", "Relationships"],
  new_thread: ["Open Threads"],
  thread_resolved: ["Open Threads"],
  hard_fact: ["Hard Facts"],
  hard_fact_superseded: ["Hard Facts"],
  correction: ["Correction"],
};

interface SectionMergeGroup {
  section: string;
  facts: ExtractedFact[];
  instruction: string;
}

/** Section-specific merge instructions — reasoning-based review of every item. */
const SECTION_INSTRUCTIONS: Record<string, string> = {
  Scene:
    "Overwrite the Scene section to reflect the CURRENT situation. Update location, who is present, and atmosphere to match the latest conversation state.",
  Characters:
    "Review each character's appearance entries. Update entries that have changed (clothing, hair, etc.). Preserve entries that haven't changed. Add new entries if relevant details were introduced. Use the nested format: ### CharName > #### Appearance > - **key**: comma-separated values.",
  "Current Demeanor":
    "Re-evaluate each character's demeanor based on recent events. Replace outdated moods. Keep it concise — 2-3 adjectives per character plus one line on group dynamic.",
  Relationships:
    "Review each relationship entry. Update dynamics that have shifted (e.g., strangers → friends, tension → trust). Remove relationship descriptions that are fully superseded by newer ones. Add new relationships that have formed.",
  Cast: "Review each cast member. Update descriptions to reflect character development. Add new characters. If a character's role has fundamentally changed, update their summary.",
  "Open Threads":
    "CRITICAL: Review EVERY existing thread. Remove threads that have been resolved or are no longer relevant to the current story. Update threads whose nature has evolved. Add new unresolved hooks. Aim for 3-8 active threads maximum. Each item has a date suffix like (added: 2026-02-16) — PRESERVE the original date when keeping/updating an item. For NEW items, add today's date.",
  "Hard Facts":
    "CRITICAL: Review EVERY existing hard fact for current relevance. REMOVE facts that have been SUPERSEDED by newer developments (e.g., 'they are strangers' must be removed once they become friends; 'interested in each other' must be removed once they start dating). UPDATE facts whose details have changed. ADD new established facts. Character biographical facts (name, age, occupation) should rarely change. Relationship-status facts and situational facts MUST be updated or removed when the situation changes. Each item has a date suffix like (added: 2026-02-16) — PRESERVE the original date when keeping/updating an item. For NEW items, add today's date.",
  Correction:
    "These are corrections to stale/outdated sections. Each correction specifies which section to fix and what it should say. OVERWRITE the indicated section entirely with the corrected value. This takes priority over all other instructions for that section.",
};

/**
 * Group facts by their target section and generate per-section merge instructions.
 * Facts that don't map to a known section go into a "General" group.
 * Facts can route to multiple sections (e.g., relationship_shift → Relationships + Cast).
 */
export function buildSectionMergeGroups(
  facts: ExtractedFact[],
): SectionMergeGroup[] {
  const groups = new Map<string, ExtractedFact[]>();

  for (const fact of facts) {
    const sections = FACT_SECTION_MAP[fact.type] ?? ["General"];
    for (const section of sections) {
      const list = groups.get(section);
      if (list) list.push(fact);
      else groups.set(section, [fact]);
    }
  }

  return [...groups.entries()].map(([section, sectionFacts]) => ({
    section,
    facts: sectionFacts,
    instruction:
      SECTION_INSTRUCTIONS[section] ??
      "Integrate these facts into the appropriate section.",
  }));
}

/**
 * Build a structured merge prompt from section groups.
 * Instructs the LLM to reason through every existing item, not just append.
 */
export function buildSectionMergePrompt(groups: SectionMergeGroup[]): string {
  const parts = [
    "You are a story state editor. Your job is to produce an UPDATED story state that accurately reflects the current state of the roleplay.",
    "",
    "APPROACH — for EVERY section, reason through each existing item:",
    "1. Is this item still accurate and relevant? If YES, keep it (update wording if needed).",
    "2. Has this item been superseded by newer events? If YES, REMOVE it or REPLACE it with the current truth.",
    "3. Are there new facts that belong in this section? If YES, ADD them.",
    "",
    "RULES:",
    "- Do NOT blindly preserve old content. If something is outdated, remove or update it.",
    "- Do NOT invent information beyond what the facts and existing state provide.",
    "- Character biographical details (name, age, occupation) are stable — change these only if the story explicitly changes them.",
    "- Relationship status, mood, situational facts, and threads are DYNAMIC — these MUST be updated or removed as the story evolves.",
    "- Output ONLY the complete updated Story State block with all 7 sections (Cast, Relationships, Characters, Scene, Current Demeanor, Open Threads, Hard Facts).",
    "- For Open Threads and Hard Facts, each bullet must end with (added: YYYY-MM-DD). Preserve the original date for kept/updated items. Use today's date for new items.",
    "- Keep it under 1200 tokens.",
    "",
    "SECTION-SPECIFIC INSTRUCTIONS:",
  ];

  for (const group of groups) {
    const factLines = group.facts
      .map(
        (f) =>
          `  - [${f.type}] ${f.detail} (turn ${f.sourceTurn}, confidence ${f.confidence})`,
      )
      .join("\n");
    parts.push(`\n### ${group.section}`);
    parts.push(group.instruction);
    parts.push(`Facts:\n${factLines}`);
  }

  return parts.join("\n");
}
