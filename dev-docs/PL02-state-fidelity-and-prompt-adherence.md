---
Status: Draft
Created: 2026-02-16
---
# PL02 — State Fidelity, Prompt Adherence, and Thread Lifecycle

## Context

With the move from localStorage to Prisma (persistent storage) and the completion of IM03 (structured state) and IM04 (entity-centric model), the state pipeline and prompt assembly system are functionally complete. However, several quality problems have surfaced during extended conversation use that undermine the reliability of the system:

1. The inference model frequently ignores parts of the system prompt and invents details that contradict established story state.
2. The automatic state update pipeline doesn't maintain sections evenly — some sections stagnate while others (Hard Facts) accumulate without pruning.
3. Open Threads become stale and are never resolved, even when the conversation has clearly moved past them.

This plan analyzes root causes and proposes concrete improvements to address each problem area. Changes are scoped to the state pipeline, prompt assembly, and summarization systems — no structural or UI changes are proposed.

---

## Progress Log

| Date | Change | Scope |
|------|--------|-------|
| 2026-02-16 | **New canonical templates.** Created `system-prompt-template.md` and `story-state-template.md` from scratch. System prompt template uses NEVER/ALWAYS hard constraint structure (1.1), includes positive location-separation guidance (1.7), and removes the Style section from story state (1.4). Story state template is clean data only — no narration guidance, no Style section. | Templates (1.1, 1.4, 1.7) |
| 2026-02-16 | **Parser bug fix: title heading → `core_rules`.** Added `HEADING_MAPPING` for `# System Prompt...` title lines so they map to `core_rules` (always/critical) instead of falling through to `custom_1` (always/normal). This retroactively fixed all 5 existing character prompt files — their core rules were being injected at `normal` priority instead of `critical`. | Parser |
| 2026-02-16 | **1.6 — Story state authority preamble.** Updated `buildSystemPrompt` in `chat/route.ts` to inject a one-line authority frame before story state: *"The following is the current canon of this roleplay. All facts listed are established truth — do not contradict them, especially Hard Facts."* Also normalized `parseStateFields` to strip parenthetical suffixes from heading keys. | `apps/web/src/app/api/chat/route.ts` |
| 2026-02-16 | **1.2 — Hard Fact authority markers.** Changed serializer to output `## Hard Facts (do not contradict these)` heading. Updated `resolveSection` in `story-state-model.ts` and `extractHardFacts` regex in `validation.ts` to handle the new heading with parenthetical suffix. | `apps/web/src/lib/story-state-model.ts`, `validation.ts` |
| 2026-02-16 | **4.3 — Reduced merge temperature.** Lowered state merge LLM temperature from 0.3 to 0.1 to reduce paraphrase drift. | `apps/web/src/app/api/state-update/route.ts` |
| 2026-02-16 | **Segment migration.** Ran `scripts/reparse-segments.mjs` to re-parse all 3 existing conversations. Promoted `custom_1` → `core_rules` (critical/order 0) while preserving user-edited segment content (e.g. Kaho's `setting_premise`). Backup at `backups/conversations-backup-20260216-214543.sql`. | All conversations in DB |

---

## Problem 1: Model Ignores System Prompt / Invents Contradictory Details

### Observed symptoms

- The model writes actions, dialogue, or thoughts for the player character despite explicit rules forbidding this.
- The model invents backstory details, character traits, or plot points that contradict what is established in the story state or system prompt.
- The model occasionally skips reacting to the player's action and jumps ahead in the narrative.
- Established facts (e.g., language barriers, character quirks, relationship status) are ignored or overridden by the model.

### Current prompt anatomy

When a system prompt file (e.g., `system-prompt-kaho.md`) is imported, the parser splits it into segments. The assembled system message sent to the model on any given turn looks roughly like:

```
[core_rules — always, critical]           ← 13 rules in a flat bullet list
[output_format — always, critical]        ← 5 formatting rules
[setting_premise — always, critical]      ← tone + premise
[character_identity — always, critical]   ← name/age/occupation + unparsed character traits
[speech_patterns — every 2 turns, high]   ← only if turn counter fires
[vocabulary_humor — every 2 turns, high]  ← only if turn counter fires
[mannerisms — every 3 turns, normal]      ← only if turn counter fires
[appearance — on_topic, normal]           ← only if user mentions appearance keywords
[outfit — on_topic, normal]              ← only if user mentions clothing keywords
[voice — on_topic, normal]               ← only if user mentions voice keywords
[backstory — on_topic, normal]           ← only if user mentions history keywords
[interaction_guide — every 3 turns]       ← 3 interaction rules
[relationship_status — on state field]    ← only if relationships exist in state
[omitted context note]                    ← one-liner listing what was skipped

## Current Story State
[full story state markdown — 300-800 tokens]

## Response Boundary (Critical)
- NEVER write dialogue, actions, thoughts, or decisions on behalf of the user/player.
- Only write for NPCs and the environment.
- Leave all user/player speech and choices for the user to provide.
```

### Root cause analysis

**1a. The `core_rules` segment is a flat list with no priority hierarchy.** The current `core_rules` segment contains 13 bullets with equal visual and structural weight:

```
- Stay strictly in-character at all times.
- Never speak, think, decide, or act on behalf of {{ user }}.
- Avoid big time skips, forced plot turns, and exposition dumps.
- If uncertain, ask an in-world clarifying question rather than inventing details.
- Assume all actions and dialogue are consensual with both parties.
```

The contract-breaking rule ("never speak for `{{ user }}`") sits next to soft style guidance ("avoid big time skips"). The model has no signal that some rules are mandatory constraints while others are best-effort preferences. LLM instruction-following degrades as rule count increases — each additional same-weight rule dilutes attention to all existing rules.

**1b. Critical constraint information is duplicated but inconsistently.** The "never write for the player" rule appears in three places:

1. `core_rules` segment (bullet 4-5, near the top)
2. `interaction_guide` segment (bullet 3: "only narrate for {{ char }} and other NPCs")
3. `Response Boundary` (appended at the very end, after story state)

Meanwhile, "never contradict established facts" appears nowhere explicitly. The `core_rules` bullet "If uncertain, ask an in-world clarifying question rather than inventing details" is the closest, but it's about uncertainty, not about contradicting known facts. **There is no rule that says "do not contradict the Story State."**

**1c. Story state has no authority framing.** The story state is injected under a plain `## Current Story State` heading. Hard Facts are listed as:

```markdown
## Hard Facts
- Kaho does not speak English well, only knowing basic questions and answers.
- Brian is a skilled chef but socially awkward, especially around women.
```

These look identical to descriptive flavor text. The model treats them as context it may elaborate on or override, not as constraints it must obey. Compare with the Amanda story's Hard Facts:

```markdown
## Hard Facts
- Westport High School is a public high school in Westport, Connecticut
- Brian is the CEO and lead developer of SnareAI
- Brian doesn't brag about his wealth
```

Some of these are genuinely immutable facts (school location) while others are behavioral tendencies that should evolve (Brian doesn't brag). They're all presented identically.

**1d. Character traits in the system prompt and story state overlap and sometimes conflict.** Looking at the Kaho story:

- **System prompt** (character identity segment): "English: Limited but improving; uses short sentences, simple vocabulary, and gestures"
- **Story state** (Hard Facts): "Kaho does not speak English well, only knowing basic questions and answers."
- **Story state** (Style): "Kaho speaks mainly japanese with other NPCs but will attempt to speak in broken english with Brian when they are alone together."

Three different sections describe the same constraint with slightly different framing. If the state pipeline updates one of these, the others may drift. The model processes all three and may pick whichever framing is most convenient for its generation.

**1e. The system prompt template has structural inconsistencies across characters.** Comparing the actual prompt files:

- **Kaho** (`system-prompt-kaho.md`): Uses `###` headings. Character section contains well-structured bullet groups (Language, Speech cadence, etc.) but without the template's sub-heading markers (no `- Speech patterns and voice` prefix — uses `- Language:`, `- English:`, `- Speech cadence:` instead). **The parser won't match these as sub-sections**, so the entire character block stays as one monolithic `character_identity` segment that's always injected.
- **Sabrina** (`system-prompt-sabrina.md`): Uses `##` headings (not `###`). Has well-structured sub-sections that match the parser's patterns (`- Speech patterns and voice`, `- Vocabulary & word choice`, etc.) so they get properly segmented.
- **Alex** (`system-prompt-alex.md`): Uses `##` headings. Similar structure to Sabrina. Has an extra `- Identity & community` sub-section that no parser pattern matches, so it falls into the character identity preamble and is always injected despite being a topic that only matters in certain conversations.
- **Amanda** (`system-prompt-amanda.md`): Uses `###` headings. Has much sparser character description. Many sub-sections have `[placeholder]` markers that were never filled.
- **Emily** (`system-prompt-emily.md`): Uses `###` headings. Has the most detailed character description but with a prose style instead of tight bullet lists, making it much more token-heavy.

This inconsistency means the parser segments prompts very differently depending on how they were written. A prompt like Kaho's sends the entire character block (~500 tokens) every turn because the sub-section patterns don't match, while Sabrina's properly rotates speech patterns and appearance.

**1f. Segment rotation creates contradiction opportunities.** When `speech_patterns` is omitted on a given turn, the model receives:

```
[Established context not injected this turn — character: Speech Patterns & Voice, Mannerisms & Physical Beats]
```

This tells the model that speech pattern guidance exists but isn't shown. The model may then write dialogue that doesn't match the character's established voice because it has no access to the actual content. If the character speaks Japanese with broken English (Kaho), the model may default to fluent English dialogue during turns when the speech pattern segment is omitted.

**1g. Story state sections in prompt files contain information that overlaps with or belongs in the system prompt.** The Kaho story state has a **Style** section:

```markdown
## Style
- Kaho speaks mainly japanese with other NPCs but will attempt to speak in broken english with Brian
- In intimate settings involving Kaho's feet, describe the smelly scent...
```

This is narration guidance, not story state. It belongs in the system prompt (either `interaction_guide` or a custom segment) where it would be subject to segment policies and wouldn't be at risk of being rewritten by the state update pipeline.

**1h. The model doesn't know how to handle location separation.** Every prompt file contains this rule in the `interaction_guide` segment:

```
- When {{ user }} and {{ char }} are not in the same location, only narrate for {{ char }} and other NPCs. Do not describe {{ user }}'s actions or thoughts.
```

This tells the model what *not* to do (don't narrate for the player) but doesn't tell it what it *should* do. In practice, when the player character leaves or is in a different location, the model tends to **Narrate the player character anyway** — it ignores the rule because without positive instruction on what to do instead, it falls back to its training tendency to continue all characters' stories. It also seems that if the player's prompt ends on an NPC doing something, the model writes the player's reaction because it feels that should logically follow, even if the rule says not to. The model needs clearer guidance on how to handle this common scenario.

The core issue is that the rule is framed as a restriction without a corresponding positive instruction. The model needs to be told: "When separated, you are still the narrator of the NPC's world — show what {{ char }} does, thinks, and experiences while {{ user }} is away. Prioritize {{ char }}, then relevant side NPCs. Do not narrate {{ user }}'s actions, thoughts, or arrival — the player will do that."

### Proposed changes

#### 1.1 — Split `core_rules` into hard constraints and soft guidelines

The current `core_rules` segment (13 bullets, ~350 tokens, `always`/`critical`) mixes inviolable rules with style preferences. Split it into two segments:

**New segment: `hard_constraints`** — `always` / `critical` / order 0

```markdown
## Rules (These override all other instructions)

You are the Narrator and all non-player characters (NPCs). {{ user }} is the player character.

NEVER do these — violating any of these rules is a critical error:
- Write dialogue, actions, thoughts, or decisions for {{ user }}.
- Describe {{ user }}'s internal state (thoughts, feelings, intentions) unless the player explicitly states them.
- Invent or state facts about characters, history, or the world that are not established in conversation or in the Current Story State below.
- Contradict any fact in the Current Story State. If it says {{ char }} doesn't speak English well, she doesn't speak English well.
- Give NPCs knowledge they couldn't reasonably have. NPCs cannot read minds but may use body language and tone.
- Narrate {{ user }}'s actions when {{ user }} and {{ char }} are in different locations. Only the player narrates for {{ user }}.

ALWAYS do these:
- React to the player's last action first, then write {{ char }}'s response.
- Stay in character. Advance the story gradually. Let the player's choices drive outcomes.
- If uncertain about a fact, have the NPC ask an in-world clarifying question rather than inventing an answer.
- When {{ user }} and {{ char }} are in different locations, continue narrating {{ char }}'s world — what {{ char }} does, thinks, and experiences. Include relevant side NPCs. Do not narrate {{ user }}'s arrival or actions; the player will do that.
```

Key changes from current `core_rules`:
- Explicit "never contradict story state" rule — currently absent.
- Concrete example inline ("if it says {{ char }} doesn't speak English well, she doesn't speak English well") — models respond better to concrete examples than abstract prohibitions.
- Reduced from 13 rules to 8, organized into "never do" and "always do" with clear framing.
- Style/pacing guidance moved out.

**Revised segment: `narration_guidelines`** — `every_n(3)` / `normal` / order 5

```markdown
Narration guidelines (follow when possible, but the Rules above take priority):
- A 'turn' is one player action followed by your response.
- Advance gradually — avoid big time skips, forced plot turns, and exposition dumps.
- Allow the player to answer questions before adding more in the same turn.
- Describe only what the player could perceive (sensory details + observable body language).
- Consequences should be consistent with prior events and character behavior.
- Assume all actions and dialogue are consensual.
```

This separates the must-never-violate contract from the should-usually-follow guidance. The pacing/style rules rotate on `every_n(3)` because they are tone guidance, not contract rules.

**Changes to the template file** (`system-prompt-template.md`):

The header section of the template (before `### Output format`) would be updated to match the new `hard_constraints` structure. The template currently opens with:

```markdown
You are the Narrator and all non-player characters (NPCs).

- A 'turn' consists of one player action followed by your action.
- The 'main' NPC is listed below. Other NPCs are minor but may evolve over time.
[...13 more bullets...]
```

This would become:

```markdown
## Rules (These override all other instructions)

You are the Narrator and all non-player characters (NPCs). {{ user }} is the player character.

NEVER do these — violating any of these rules is a critical error:
- Write dialogue, actions, thoughts, or decisions for {{ user }}.
- Describe {{ user }}'s internal state unless the player explicitly states them.
- Invent facts not established in conversation or Current Story State.
- Contradict any fact in the Current Story State.
- Give NPCs knowledge they couldn't reasonably have.

ALWAYS do these:
- React to the player's last action first, then write {{ char }}'s response.
- Stay in character. Advance gradually. Let the player's choices drive outcomes.
- If uncertain, have the NPC ask an in-world question rather than inventing an answer.

---

Narration guidelines:
- A 'turn' is one player action followed by your response.
- Avoid big time skips, forced plot turns, and exposition dumps.
- Allow the player to answer before adding more questions in the same turn.
- Describe only what the player could perceive when characters are co-located.
- Consequences should be consistent with prior events.
- Assume all actions and dialogue are consensual.
```

The `---` separator between hard constraints and soft guidelines gives the parser a signal to split them. The parser would need a new pattern to detect this split (matching on the `---` within the core rules section).

#### 1.2 — Hard Fact authority markers in story state serializer

Change the story state serializer (`structuredToMarkdown` in `story-state-model.ts`) to output:

**Current:**
```markdown
## Hard Facts

- Kaho does not speak English well, only knowing basic questions and answers.
- Brian is a skilled chef but socially awkward, especially around women.
```

**Proposed:**
```markdown
## Hard Facts (do not contradict these)

- ⚠ Kaho does not speak English well, only knowing basic questions and answers.
- ⚠ Brian is a skilled chef but socially awkward, especially around women.
```

The heading change and `⚠` prefix reinforces the authority frame from `hard_constraints`. The serializer change is ~3 lines of code. The parser would also need a minor update to strip the `⚠` prefix when parsing hard facts back into structured state.

Also update the story state templates to use this format, so new stories start with the correct framing.

#### 1.3 — Standardize system prompt template structure for reliable parsing

The parser relies on specific patterns (`- Speech patterns and voice`, `- Vocabulary & word choice`, etc.) to segment the character block. However, the actual prompt files use inconsistent formatting:

| File | Heading level | Character sub-section style | Segments properly? |
|------|-------------|---------------------------|-------------------|
| `system-prompt-template.md` | `###` | Correct patterns | Yes |
| `system-prompt-sabrina.md` | `##` | Correct patterns | Yes |
| `system-prompt-alex.md` | `##` | Correct patterns + extras | Mostly (extras go into preamble) |
| `system-prompt-kaho.md` | `###` | Different patterns (`- Language:`, `- English:`) | **No** — whole block is one segment |
| `system-prompt-amanda.md` | `###` | Sparse, many placeholders | Partially |
| `system-prompt-emily.md` | `###` | Prose paragraphs, not bullets | **No** — whole block is one segment |

**Proposed fix — update prompt files to match parser patterns:**

Rewrite `system-prompt-kaho.md`'s character section to use the parser-recognized sub-headings:

**Current (doesn't segment):**
```markdown
- Default affect: Warm, upbeat, practical; not overly dramatic
- Core values: Politeness, reliability, doing the job well
- Humor: Light teasing with regulars; gentle, situational jokes
- Conflict style: Avoids open confrontation

- Language: Native Japanese; uses appropriate honorifics
- English: Limited but improving; uses short sentences
- Speech cadence: Moderate pace; clear when focused on work
- Common fillers: "えっと… / ano…"; in English: "um… ah…"
```

**Proposed (matches parser patterns):**
```markdown
- Speech patterns and voice
  - Native Japanese; uses appropriate honorifics and polite forms with customers/strangers
  - English: Limited but improving; uses short sentences, simple vocabulary, and gestures; asks for clarification instead of guessing
  - Moderate pace; clear when focused on work; more casual with friends
  - Common fillers (when searching for words): "えっと… / ano…"; in English: "um… ah…"

- Vocabulary & word choice
  - Default affect: Warm, upbeat, practical; not overly dramatic
  - Core values: Politeness, reliability, doing the job well, not causing trouble for others
  - Humor: Light teasing with regulars; gentle, situational jokes
  - Conflict style: Avoids open confrontation; prefers soft refusals, compromise, or changing the subject
```

The same restructuring should be done for Emily and any other prompts that don't match the parser patterns. This is a content change to the template files only — no code changes needed.

**Additionally, make the parser more resilient** to heading-level differences (`##` vs `###`). Currently the parser splits on any `#{1,4}` heading, but the `HEADING_MAPPINGS` patterns assume `###`. Since Sabrina and Alex use `##`, we should verify and document that `##` works (it does — the parser strips the `#` prefix before matching). The bigger issue is that some prompts add custom bullets in the character block (like Alex's `- Identity & community:` or Kaho's `- Location:`) that don't match any pattern and get absorbed into the always-injected preamble, inflating the critical-priority token budget.

**New parser pattern recommendations:**

Add sub-section patterns for commonly used but currently unmatched bullet groups:

| Pattern | Maps to | Policy |
|---------|---------|--------|
| `- Identity & community` | new `identity_community` segment | `on_topic(["identity", "queer", "bisexual", "gender", "community", "pride"])` |
| `- Flirtation` / `- Interaction with {{ user }}` | fold into `interaction_guide` | `every_n(3)` |
| `- Default affect` / `- Core values` / `- Conflict style` | new `personality_core` segment | `every_n(4)` |
| `- Location` / `- Public presence` | fold into `setting_premise` | `always` |
| `- Grooming` / `- Build/height` | fold into `appearance_visual` | `on_topic` |

This reduces the amount of always-injected content by properly routing character traits into rotated segments.

#### 1.4 — Separate narration guidance from story state (Style section)

The `## Style` section in story state files (present in Kaho, Emily, Amanda) contains narration instructions, not facts:

```markdown
## Style
- Kaho speaks mainly japanese with other NPCs but will attempt to speak in broken english with Brian
- In intimate settings involving Kaho's feet, describe the smelly scent...
```

These are model instructions that should be in the system prompt, not in the story state where the state pipeline might modify them. Two options:

**Option A — Move to system prompt as a custom segment.** During import, if a story state file contains `## Style`, extract it as a separate custom segment with an `always` policy and inject it alongside the system prompt segments. This keeps narrative guidance out of the state update pipeline entirely.

**Option B — Mark as pipeline-exempt in story state.** Add a `pipelineExempt` flag to certain story state sections. The serializer includes them in the markdown sent to the model, but the state pipeline skips them during merge. This is simpler but keeps the data in the "wrong" place (story state vs system prompt).

**Recommendation**: Option A. Narration guidance is prompt configuration, not story state. The user can still edit it in the system prompt segment editor.

#### 1.5 — Improve omitted-context notes for safety-critical segments

When segments are omitted due to rotation policies, the current note is:

```
[Established context not injected this turn — character: Speech Patterns & Voice, Mannerisms & Physical Beats]
```

This tells the model that content exists but gives no hint about what's in it. For segments that contain safety-critical constraints (like language barriers in speech patterns), this creates a contradiction opportunity.

**Proposed**: For segments with `high` or `critical` priority, include a one-line summary of the key constraint alongside the omitted note:

```
[Established context not injected this turn — character: Speech Patterns & Voice ({{ char }} has limited English — use simple/broken English and gestures), Mannerisms & Physical Beats]
```

This requires adding an optional `omittedSummary` field to `PromptSegment`:

```typescript
interface PromptSegment {
  // ...existing fields...
  /** One-line summary included in omitted-context notes. Helps prevent
      contradiction when the segment is rotated out. */
  omittedSummary?: string;
}
```

The assembler already generates the omitted-context note in `buildResult()`. It would simply append each segment's `omittedSummary` in parentheses if present. The summary is populated from the prompt file during parsing (extractable from the first bullet of each sub-section) or manually set during segment editing.

#### 1.6 — Restructure assembled prompt position order

Change how `buildSystemPrompt` in `chat/route.ts` assembles the final system message. Currently:

```
[Assembled segments]
[Story State]
[Response Boundary]
```

Proposed:

```
[Hard Constraints]                    ← new segment, order 0
[Character Identity + Setting]        ← always/critical segments
[Rotated character detail segments]   ← every_n / on_topic segments
[Omitted context note]
[Story State preamble]                ← "The following is the current state of the story.
                                         Obey all facts listed, especially Hard Facts."
[Story State]
[Response Boundary — shortened]       ← single reminder line
```

The key change is the **story state preamble** — a single sentence injected by `buildSystemPrompt` that frames the story state as authoritative:

```
The following Story State contains the current facts of this roleplay. All facts listed are canon — do not contradict them, especially facts under Hard Facts.
```

This is cheap (~30 tokens) and creates a semantic bridge between the hard constraints at the top and the story state content. Currently the story state appears with no framing at all — just `## Current Story State` followed by the markdown.

#### 1.7 — Location separation narration guidance

Replace the negative-only rule in the `interaction_guide` segment and system prompt template with a positive instruction that tells the model what to do when characters are separated:

**Current (in every prompt file's interaction guidelines):**
```
- When {{ user }} and {{ char }} are not in the same location, only narrate for {{ char }} and other NPCs. Do not describe {{ user }}'s actions or thoughts.
```

**Proposed:**
```
- When {{ user }} and {{ char }} are not in the same location:
  - Continue narrating {{ char }}'s world — show what {{ char }} does, thinks, feels, and experiences.
  - Include relevant side NPCs and their interactions with {{ char }}.
  - Do NOT narrate {{ user }}'s actions, thoughts, location, or arrival. The player will decide when and how {{ user }} re-enters the scene.
  - Do NOT time-skip to reunite the characters. Stay in {{ char }}'s present moment.
```

This also needs to be reflected in the `hard_constraints` segment (covered in 1.1 above) so it survives when `interaction_guide` is rotated out.

**Template and prompt file updates:** All 5 prompt files (`kaho`, `sabrina`, `alex`, `amanda`, `emily`) and the template need the `interaction_guide` rule rewritten. This is a text change only — no code needed.

#### 1.8 — Post-response contradiction detection (Phase 2)

Add a lightweight post-response check that scans the model's output for potential hard fact violations. This runs client-side after the response streams in.

**V0 (heuristic, Phase 2):** For each hard fact, extract key entities and predicates (e.g., from "Kaho does not speak English well" → entity: Kaho, predicate: limited English). Check if the response contains counter-evidence (e.g., Kaho speaking fluent multi-sentence English). Flag the message with a subtle indicator.

**V1 (semantic, Phase 3):** Use the existing embedding infrastructure to compute similarity between hard fact negations and response content.

This is detection only — the user decides whether to regenerate or accept.

---

## Problem 2: State Staleness and Hard Fact Accumulation

### Observed symptoms

- Hard Facts section grows monotonically — facts are added but never pruned, even when they become irrelevant (e.g., "Kaho and Brian are strangers" persists long after they've become friends).
- Appearance section rarely updates even when the narrative describes clothing changes or new visual details.
- Cast descriptions remain frozen at their initial import values despite character development in conversation.
- Scene section sometimes updates inconsistently — atmosphere refreshes but location or presence list may be stale.
- Current Demeanor section is the most reliably updated but often gets overwritten with generic moods.

### Root cause analysis

**2a. Hard Facts have a "never remove" instruction that is too absolute.** Both the state-update merge prompt and the summarize prompt say "NEVER remove existing hard facts unless explicitly contradicted." This creates asymmetric pressure — adding facts is easy, removing them requires the model to detect explicit contradiction, which it rarely produces. Facts that are no longer relevant (but not contradicted) accumulate indefinitely.

**2b. The merge pipeline routes facts to only one section.** The `FACT_SECTION_MAP` routes each fact type to exactly one section. A `relationship_shift` fact updates Relationships but not Cast descriptions, even though Cast often contains relationship context. An `appearance_change` updates Appearance but not the overall vibe. There is no cross-section propagation.

**2c. Fact extraction doesn't capture gradual drift.** The fact extractor looks for discrete events ("scene_change", "cast_change"). It doesn't capture slow evolution — a character's description becoming more nuanced over time, or a relationship gradually deepening. These changes happen across many turns and aren't captured by any single fact extraction.

**2d. No staleness detection.** No mechanism checks whether a piece of state is outdated. A Hard Fact from turn 5 like "they are strangers" may still be present at turn 100 when they are clearly close friends. The validation pipeline checks that hard facts are *preserved*, not that they are *current*.

**2e. Substring matching is brittle.** The validation check for hard fact preservation uses substring matching. If the LLM slightly paraphrases a fact during merge, the validator flags it as "removed" even though the semantic content is preserved. This makes the system overly conservative — it learns to never touch hard facts at all because any rewording triggers a flag.

### Proposed changes

#### 2.1 — Hard Fact lifecycle: relevance tagging

Replace the flat `HardFact` type with a richer model:

```typescript
interface HardFact {
  fact: string;
  /** Turn number when this fact was established */
  establishedAt: number;
  /** Turn number when this fact was last confirmed as relevant by the pipeline */
  lastConfirmedAt: number;
  /** Whether this fact has been superseded by newer information */
  superseded: boolean;
  /** If superseded, what replaced it */
  supersededBy?: string;
}
```

The state pipeline gains a new **relevance check** stage between fact extraction and merge:

1. For each existing hard fact, the LLM is asked: "Given the recent conversation, is this fact still accurate and relevant? If it has been superseded, what replaces it?"
2. Facts marked as superseded are soft-deleted (kept in storage with `superseded: true` but excluded from the serialized markdown sent to the model).
3. The UI shows superseded facts in a "archived" section that the user can review and restore.

**Why not just delete?** Irreversible deletion of hard facts is dangerous — the LLM might incorrectly judge a fact as superseded. Soft deletion lets the user recover. The storage cost is negligible since facts are short strings. Focus the LLM call on only facts that haven't been confirmed in the last N turns (e.g., 20 turns), so the cost is bounded.

#### 2.2 — Section freshness tracking

Add per-section `lastUpdatedAt` tracking to `StructuredStoryState`:

```typescript
interface SectionMeta {
  lastUpdatedAt: number;  // turn number
  updateCount: number;    // how many times this section has been modified
}

interface StructuredStoryState {
  // ... existing fields ...
  sectionMeta: Record<string, SectionMeta>;
}
```

The state pipeline updates `sectionMeta` whenever a section is modified. When a section hasn't been updated in a configurable number of turns (e.g., 30), the pipeline proactively asks the LLM to review that section against recent conversation:

> "The Appearance section hasn't been updated in 35 turns. Review the recent conversation and determine if any appearance details have changed. If so, update the section. If not, confirm the existing details are current."

This is a **periodic refresh** mechanism, not a per-turn check. It runs as part of the merge stage, only for stale sections, so the additional cost is bounded.

#### 2.3 — Cross-section fact propagation

Extend `FACT_SECTION_MAP` to support multi-section routing:

```typescript
const FACT_SECTION_MAP: Record<string, string[]> = {
  scene_change: ["Scene"],
  appearance_change: ["Appearance"],
  mood_change: ["Current Demeanor"],
  relationship_shift: ["Relationships", "Cast"],       // also update cast description
  cast_change: ["Cast", "Relationships"],              // also check relationship implications
  new_thread: ["Open Threads"],
  thread_resolved: ["Open Threads"],
  hard_fact: ["Hard Facts"],
};
```

The merge prompt is updated to handle multi-section facts: "This fact may affect multiple sections. Update each listed section as appropriate."

#### 2.4 — Semantic preservation checking

Replace the brittle substring matching in `validateState()` with a two-tier check:

1. **Exact match** (fast): Current substring matching — if it passes, the fact is preserved.
2. **Semantic fallback** (if exact match fails): Use the same embedding model already available (`text-embedding-3-small` via OpenRouter) to compute cosine similarity between the old fact and the closest fact in the candidate state. If similarity > 0.85, consider it preserved (likely a paraphrase). If similarity < 0.85, flag as potentially removed.

This prevents false positives from paraphrasing while still catching genuine deletions. The embedding calls are batched and only fire for facts that fail the exact match, so the additional cost is proportional to the number of paraphrased facts (usually 0-2 per update).

---

## Problem 3: Stale Open Threads

### Observed symptoms

- Open Threads accumulate over time, similar to hard facts.
- Threads that have been narratively resolved (the conversation addressed the hook, answered the question, or resolved the tension) remain in the state indefinitely.
- The `thread_resolved` fact type exists in the pipeline but is rarely extracted — the model doesn't proactively identify thread resolution during fact extraction.
- When `thread_resolved` is extracted, the merge instruction is "remove that thread" — a permanent, irreversible deletion that risks data loss if the model hallucinated the resolution.

### Root cause analysis

**3a. Threads have no structure for resolution detection.** A thread like "Kaho is interested in learning more about Brian" is a vague narrative hook. There is no definition of what "resolved" means for this thread. The fact extractor would need to infer resolution from context, which is subjective and error-prone.

**3b. The fact extractor is biased toward new events.** The extraction prompt asks for "new facts" — it's oriented toward what just happened, not toward what past threads might now be resolved. Thread resolution is a retrospective judgment, not a forward-looking observation. The extractor rarely produces `thread_resolved` facts because it's not primed to look for them.

**3c. Thread deletion is all-or-nothing.** A thread is either present or deleted. There's no intermediate state like "partially addressed" or "superseded by a new thread." Many threads evolve rather than resolve — "interested in learning more" might evolve into "has started learning from Brian" rather than simply being resolved.

### Proposed changes

#### 3.1 — Structured thread model

Replace the flat `StoryThread` type with a richer model:

```typescript
interface StoryThread {
  id: string;
  description: string;
  /** What would resolution look like? Helps the pipeline detect when it's done. */
  resolutionHint: string;
  /** Turn when thread was created */
  createdAt: number;
  /** Turn when thread was last referenced in conversation */
  lastReferencedAt: number;
  /** Current status */
  status: "active" | "evolved" | "resolved" | "stale";
  /** If evolved, what it evolved into (reference to another thread ID) */
  evolvedInto?: string;
}
```

The `resolutionHint` is the key addition. When the pipeline creates a new thread, it also generates a one-line description of what resolution would look like. For example:

| Thread | Resolution Hint |
|--------|----------------|
| "Kaho is interested in learning more about Brian" | "They have a substantive conversation about technique or cooking" |
| "Brian wants to see Kaho in action at her kitchen" | "Brian visits Kaho's kitchen and watches her work" |
| "Jiro proposed a partnership between Nagato Ramen and That's Rice" | "Kaho and Jiro reach a decision about the partnership (accept/reject/negotiate)" |

The resolution hint gives the fact extractor concrete criteria to check against.

#### 3.2 — Thread lifecycle pipeline

Add a dedicated thread evaluation stage to the state pipeline, running after fact extraction:

1. **Reference detection**: For each active thread, check if the recent messages reference or advance it. Update `lastReferencedAt`.
2. **Resolution check**: For each active thread with a `resolutionHint`, ask the LLM: "Given the recent conversation, has this thread been resolved? Has it evolved into something new?"
3. **Staleness detection**: Threads not referenced in N turns (e.g., 25) are automatically marked `stale`. Stale threads are excluded from the serialized markdown but preserved in storage.
4. **Status transitions**:
   - `active` → `resolved`: Thread's resolution hint was satisfied. Kept in storage with timestamp, excluded from serialized state. The user can review resolved threads in the UI.
   - `active` → `evolved`: Thread transformed into a new thread. The old thread is linked to the new one via `evolvedInto`. Old thread is excluded from serialized state.
   - `active` → `stale`: Thread hasn't been referenced in a long time. Excluded from serialized state but restorable.
   - `stale` → `active`: If a stale thread is referenced again in conversation, it is re-activated.

**Why not just delete?** Same principle as hard facts — threads should be soft-removed rather than hard-deleted. The model might incorrectly judge resolution, or a thread might become relevant again later in the story.

#### 3.3 — Thread-aware summarization

Update the summarize prompt to include thread lifecycle awareness:

```
## Open Threads
- 3-8 bullets of active unresolved narrative hooks.
- For each thread, include a brief resolution hint in parentheses: what would it mean for this to be resolved?
- If a thread has been clearly resolved in conversation, mark it [RESOLVED] and move on — do not carry it forward.
- If a thread has evolved (the question changed, the dynamic shifted), write the evolved version instead.
- Do not carry threads that haven't been referenced in the conversation for a long time.
```

#### 3.4 — Thread-aware fact extraction

Update the fact extraction prompt to explicitly prime for thread resolution:

```
Additional fact types to look for:
- "thread_resolved": A previously open thread has been satisfactorily addressed.
  Reference: Check the Open Threads section and their resolution hints.
  Only extract this if the conversation clearly satisfies the resolution hint.
- "thread_evolved": An open thread's nature has changed — the question shifted,
  the dynamic developed. Include what the thread evolved into.
```

By providing the resolution hints in the extraction context, the model has concrete criteria to evaluate rather than making subjective judgments about what counts as resolution.

---

## Problem 4: Merge Quality and Pipeline Reliability (Additional)

### Observed symptoms

- The merge LLM sometimes rewrites sections in different words, triggering false preservation failures.
- Retry logic repeats the exact same prompt, producing the same failure.
- Low-confidence facts are silently discarded with no path to recovery.
- The merge prompt is generic — it doesn't adapt based on what failed in validation.

### Root cause analysis

**4a. Retry without feedback.** When the merge fails validation, the pipeline retries with the identical prompt. The model likely produces similar output. There is no mechanism to tell the model *what went wrong* on the retry.

**4b. Low-confidence facts have no recovery path.** Facts below the 0.6 confidence threshold are filtered out and forgotten. If the same fact appears in multiple extraction windows with low confidence, it never accumulates enough evidence to be accepted.

**4c. Merge temperature allows creative drift.** Temperature 0.3 is low but nonzero. For a task that should be precise editing (merge facts into existing text), any creativity is harmful. The merge task is closer to structured editing than generation.

### Proposed changes

#### 4.1 — Informed retry with validation feedback

When the merge fails validation, the retry prompt should include the specific failure:

```
Your previous merge attempt had the following issues:
- Hard fact removed: "Kaho does not speak English well" was not found in your output.
- Unknown fact added: "Brian speaks conversational Japanese" was not in the extracted facts.

Please re-merge, preserving all existing hard facts exactly as written and only
adding facts from the extracted set.
```

This gives the model specific correction targets rather than hoping a random retry produces different output.

#### 4.2 — Low-confidence fact accumulation

Instead of discarding low-confidence facts, store them in a per-conversation accumulator:

```typescript
interface PendingFact {
  fact: ExtractedFact;
  occurrences: number;      // how many extraction windows produced this fact
  firstSeenAt: number;      // turn number
  lastSeenAt: number;       // turn number
}
```

When a low-confidence fact appears again in a subsequent extraction window (matched by semantic similarity), increment its `occurrences`. When occurrences reach a threshold (e.g., 3), promote it to accepted — the fact has been corroborated across multiple turns.

This is stored in the database alongside the conversation, not in memory, so it persists across sessions.

#### 4.3 — Reduce merge temperature to near-zero

Change the merge temperature from 0.3 to 0.1. The merge task is deterministic editing — the model should change exactly what the facts describe and preserve everything else verbatim. Creative variation in the merge step is the source of many paraphrasing issues that then trigger false validation failures.

Also consider lowering the fact extraction temperature from 0.2 to 0.1 for the same reason — fact extraction should be precise observation, not creative interpretation.

---

## Problem 5: Summarization and State Pipeline Coordination (Additional)

### Observed symptoms

- The manual summarize endpoint (`/api/summarize`) and the automatic state pipeline (`/api/state-update`) can modify story state independently.
- The summarize endpoint does a full rewrite of all sections, which can undo incremental improvements made by the state pipeline.
- If the user triggers manual summarization shortly after the auto-pipeline ran, the pipeline's changes may be overwritten.

### Root cause analysis

**5a. Two independent writers with no coordination.** The state pipeline applies targeted, per-section updates. The summarize endpoint does a full rewrite. They don't know about each other's recent changes.

**5b. Summarize endpoint doesn't benefit from pipeline improvements.** The summarize endpoint still uses the original monolithic rewrite approach — it sends the current state + conversation and asks for a complete rewrite. It doesn't use the fact extraction, per-section merge, or validation infrastructure that the pipeline provides.

### Proposed changes

#### 5.1 — Unify summarization through the state pipeline

Deprecate the separate `/api/summarize` endpoint. Instead, have the manual "summarize" action trigger the same state pipeline with a flag that forces a full update:

```typescript
// In the state-update route
const { mode } = request;  // "incremental" (auto) or "full" (manual)

if (mode === "full") {
  // Run fact extraction over the full conversation (not just recent messages)
  // Force-update all sections, including stale ones
  // Run thread lifecycle evaluation
  // Run hard fact relevance check
}
```

This ensures that both automatic and manual updates go through the same validation, merge, and acceptance pipeline. The manual trigger simply broadens the scope (full conversation review instead of recent messages only).

**Why**: A single code path for state modification eliminates coordination bugs, ensures consistent validation, and lets improvements to the pipeline benefit both automatic and manual updates.

#### 5.2 — Review mode uses pipeline output

In review mode (`reviewMode: true`), the pipeline output is shown to the user for approval instead of being auto-accepted. This replaces the current two-system approach (pipeline for auto, summarize for manual) with a single system that adapts its acceptance policy based on user preference.

---

## Implementation Phases

### Phase 1: Quick wins (low risk, immediate impact)

| Change | Effort | Risk | Impact | Status |
|--------|--------|------|--------|--------|
| 1.1 — Split core_rules into hard constraints + guidelines | Low | Low | High — addresses most common complaint | **Template done** — character files need migration |
| 1.2 — Hard fact authority markers in serializer | Trivial | Low | Medium — improves fact adherence | **Done** |
| 1.3 — Standardize prompt files for reliable parsing | Medium | Low | High — fixes Kaho/Emily segment inflation | |
| 1.4 — Move Style sections from story state to system prompt | Low | Low | Medium — prevents pipeline corruption of narration rules | **Template done** — character files need migration |
| 1.6 — Restructure assembled prompt position order | Low | Low | High — adds story state authority framing | **Done** |
| 1.7 — Location separation narration guidance | Low | Low | High — fixes NPC narration when separated from player | **Template done** — character files need migration |
| 2.3 — Cross-section fact propagation | Low | Low | Medium — reduces section staleness | |
| 4.3 — Reduce merge temperature | Trivial | Low | Medium — reduces paraphrase drift | **Done** |

### Phase 2: Pipeline improvements (moderate complexity)

| Change | Effort | Risk | Impact |
|--------|--------|------|--------|
| 1.5 — Omitted-context summaries for safety-critical segments | Medium | Low | Medium — prevents rotation contradictions |
| 3.1 — Structured thread model | Medium | Low | High — prerequisite for thread lifecycle |
| 3.2 — Thread lifecycle pipeline | Medium | Medium | High — solves thread staleness |
| 3.3 — Thread-aware summarization | Low | Low | Medium — better thread handling in manual flow |
| 3.4 — Thread-aware fact extraction | Low | Low | Medium — better thread detection |
| 4.1 — Informed retry with validation feedback | Low | Low | Medium — better retry success rate |
| 2.2 — Section freshness tracking | Medium | Low | Medium — proactive staleness correction |

### Phase 3: Advanced improvements (higher complexity)

| Change | Effort | Risk | Impact |
|--------|--------|------|--------|
| 1.8 — Post-response contradiction detection | High | Medium | Medium — detection only, not correction |
| 2.1 — Hard fact lifecycle (relevance tagging) | Medium | Medium | High — solves fact accumulation |
| 2.4 — Semantic preservation checking | Medium | Low | Medium — reduces false validation failures |
| 4.2 — Low-confidence fact accumulation | Medium | Low | Medium — recovers missed facts |
| 5.1 — Unify summarization through pipeline | High | Medium | High — eliminates coordination bugs |
| 5.2 — Review mode uses pipeline output | Medium | Low | Medium — cleaner UX |

### Dependencies

```
Phase 1 (no deps, all independent)
  ↓
Phase 2
  1.5 depends on nothing (can parallel with Phase 1)
  3.1 → 3.2 (thread model before lifecycle)
  3.1 → 3.3, 3.4 (thread model before extraction/summarization changes)
  ↓
Phase 3
  1.8 depends on nothing in Phase 2 (can be parallel)
  2.1 depends on nothing in Phase 2 (can be parallel)
  5.1 → 5.2 (unify before review mode change)
  2.4 requires topic-embeddings infrastructure (already exists)
```

---

## Metrics

Track these to measure improvement:

1. **Hard fact violation rate** — how often the model's response contradicts a hard fact (manual review of flagged responses from 1.4, or spot checks).
2. **Player agency violation rate** — how often the model writes for the player character (can be detected heuristically by checking if `{{ user }}`'s name appears in dialogue attribution in the response).
3. **Thread churn** — ratio of active threads to total threads created. Should increase (fewer stale threads) after Phase 2.
4. **Hard fact count trajectory** — should plateau or decrease slightly after 2.1, instead of monotonically increasing.
5. **Section update distribution** — histogram of which sections are updated by the pipeline. Should become more even after 2.2 and 2.3.
6. **Merge retry rate** — should decrease after 4.1 and 4.3.
7. **False preservation failure rate** — should decrease after 2.4.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Additional LLM calls (thread evaluation, relevance check) increase latency and cost | Gate behind turn interval — only run every N turns, not every response. Batch calls where possible. |
| Soft-deletion of hard facts/threads adds storage complexity | Minimal — hard facts and threads are small strings. The storage cost is negligible vs. conversation message history. |
| Hard fact relevance checking might incorrectly mark facts as superseded | Soft-delete only — user can review and restore. Conservative similarity threshold. |
| Thread resolution detection may hallucinate | Resolution hints provide concrete criteria. Require high confidence from the LLM. Soft-resolve only. |
| Reducing merge temperature may make the model too rigid | 0.1 is still nonzero. Monitor merge quality and adjust if sections become too literal/mechanical. |
| Unifying summarization through the pipeline is a significant refactor | Can be deferred to Phase 3. The pipeline and summarize endpoints can coexist in the interim. |
