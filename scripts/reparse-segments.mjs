/**
 * Migration: re-parse customSegments for all conversations.
 *
 * Fixes the parser bug where `# System Prompt...` title was parsed as
 * `custom_1` (always/normal) instead of `core_rules` (always/critical).
 *
 * Strategy:
 *   1. Re-parse the raw `systemPrompt` markdown with the updated parser
 *   2. Merge: prefer user-edited segment content over freshly-parsed content
 *   3. Write updated customSegments back to the database
 *
 * Run: node scripts/reparse-segments.mjs [--dry-run]
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pg = require("/home/brian/projects/chatterbox/node_modules/.pnpm/node_modules/pg");

// Import parser — use dynamic import for the TS source via tsx loader
const { parseSystemPromptToSegments } =
  await import("../packages/prompt-assembly/src/parser.ts");

const DRY_RUN = process.argv.includes("--dry-run");

const client = new pg.Client(
  "postgresql://chatterbox:chatterbox@localhost:5432/chatterbox",
);
await client.connect();

const convos = await client.query(
  'SELECT id, title, "systemPrompt", "customSegments" FROM "Conversation"',
);

console.log(
  `Found ${convos.rows.length} conversations. ${DRY_RUN ? "(DRY RUN)" : ""}\n`,
);

for (const row of convos.rows) {
  const { id, title, systemPrompt, customSegments } = row;
  console.log(`--- ${title} (${id}) ---`);

  if (!customSegments || !Array.isArray(customSegments)) {
    console.log("  No customSegments, skipping.\n");
    continue;
  }

  // Build lookup of existing segments by ID
  const oldById = new Map();
  for (const seg of customSegments) {
    oldById.set(seg.id, seg);
  }

  // Re-parse with updated parser
  const freshSegments = parseSystemPromptToSegments(systemPrompt);

  // Build lookup of fresh segments by ID
  const freshById = new Map();
  for (const seg of freshSegments) {
    freshById.set(seg.id, seg);
  }

  // Merge strategy:
  // - For each fresh segment: use fresh structure (id, policy, priority, order, category)
  //   but keep old content if the user edited it (content differs from fresh parse)
  // - For old segments that have no fresh counterpart AND aren't being replaced:
  //   keep them (user-added custom segments)
  // - The `custom_1` that was really core_rules: it's now `core_rules` in fresh parse,
  //   so old `custom_1` should be dropped if fresh has `core_rules`

  const merged = [];
  const usedOldIds = new Set();

  for (const fresh of freshSegments) {
    const old = oldById.get(fresh.id);
    if (old) {
      // Same ID exists — keep user-edited content if it differs
      usedOldIds.add(fresh.id);
      if (old.content !== fresh.content) {
        console.log(
          `  [${fresh.id}] keeping user-edited content (${old.tokenEstimate} tokens)`,
        );
        merged.push({
          ...fresh,
          content: old.content,
          tokenEstimate: old.tokenEstimate,
        });
      } else {
        console.log(`  [${fresh.id}] content unchanged`);
        merged.push(fresh);
      }
    } else {
      // New segment from re-parse (e.g., core_rules that was previously custom_1)
      // Check if old custom_1 content matches what this should be
      if (fresh.id === "core_rules" && oldById.has("custom_1")) {
        const oldCustom = oldById.get("custom_1");
        usedOldIds.add("custom_1");
        console.log(
          `  [core_rules] ← promoted from custom_1 (was priority:${oldCustom.priority}, now:${fresh.priority})`,
        );
        // Use the old content (it was the core rules all along)
        merged.push({
          ...fresh,
          content: oldCustom.content,
          tokenEstimate: oldCustom.tokenEstimate,
        });
      } else {
        console.log(`  [${fresh.id}] new segment from re-parse`);
        merged.push(fresh);
      }
    }
  }

  // Keep any old segments that weren't matched (user-added custom segments, etc.)
  for (const old of customSegments) {
    if (!usedOldIds.has(old.id) && !freshById.has(old.id)) {
      // Only keep if it's not custom_1 being replaced by core_rules
      if (old.id === "custom_1" && freshById.has("core_rules")) {
        console.log(`  [custom_1] dropped (replaced by core_rules)`);
      } else {
        console.log(`  [${old.id}] keeping orphaned segment`);
        merged.push(old);
      }
    }
  }

  merged.sort((a, b) => a.order - b.order);

  // Report changes
  const oldIds = customSegments.map((s) => `${s.id}(${s.priority})`).join(", ");
  const newIds = merged.map((s) => `${s.id}(${s.priority})`).join(", ");
  const changed = oldIds !== newIds;

  if (changed) {
    console.log(`  OLD: ${oldIds}`);
    console.log(`  NEW: ${newIds}`);
  } else {
    console.log(`  No structural changes needed.`);
  }

  if (!DRY_RUN && changed) {
    await client.query(
      'UPDATE "Conversation" SET "customSegments" = $1 WHERE id = $2',
      [JSON.stringify(merged), id],
    );
    console.log(`  ✓ Updated.\n`);
  } else {
    console.log(`  ${DRY_RUN ? "(dry run, not writing)" : "(no changes)"}\n`);
  }
}

await client.end();
console.log("Done.");
