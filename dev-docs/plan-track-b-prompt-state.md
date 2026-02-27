---
Status: In Progress
Last Updated: 2026-02-13 13:52
---

# Track B: Prompt & State Optimization — Implementation Plan

## Overview

Track B addresses two coupled problems: **how context is assembled before each request** (prompt assembly) and **how world state is built, validated, and injected** (state management). The current system sends a monolithic system prompt and a monolithic story state on every turn, with no intelligence about what's needed or whether the state is accurate.

This plan covers:

1. **Plug-and-play segmented prompt assembly** — a scalable architecture for conditional context injection
2. **Intelligent state building** — anti-hallucination, parallel updates, auto-accept with validation
3. **State history and diff UI** — non-disruptive updates with accessible change history
4. **State truncation diagnosis and fix** — resolving the cut-off story state issue

---

## Current Architecture (What We're Replacing)

### Prompt assembly

`buildSystem()` in `src/app/api/chat/route.ts` is a single-line string concatenation:

```typescript
function buildSystem(systemPrompt: string, storyState: string): string {
  return storyState ? `${systemPrompt}\n\n## Current Story State\n${storyState}` : systemPrompt;
}
```

The entire ~2000-token system prompt and the entire story state are concatenated and sent every turn. There is no mechanism to include/exclude portions, no awareness of what's relevant to the current turn, and no way to add new context blocks without editing this function.

### State building

`/api/summarize/route.ts` uses `generateText()` with `maxOutputTokens: 1024` and a `SUMMARIZE_INSTRUCTION` constant that asks the model to produce 7 structured sections. The result is proposed to the user via a diff review UI that requires manual accept/reject for each hunk.

### Problems with current state

- **Monolithic prompt** — adding new context types (dialogue examples, rapport, appearance hints) requires editing `buildSystem()` and the API route each time
- **No conditional injection** — appearance details are sent even when the conversation is about music; backstory is sent even 200 turns in
- **State truncation** — story state output gets cut off (diagnosed below)
- **Blocking review flow** — user must accept/reject state updates, interrupting roleplay
- **No state validation** — hallucinated or invented details are accepted if the user doesn't catch them
- **Sequential with chat** — summarization blocks on the same thread, can't run in parallel

---

## Part 1: Plug-and-Play Segmented Prompt Assembly

### Design Philosophy

The assembler should work like a **component system**: each piece of context is a self-contained segment with metadata describing when and how it should be injected. Note that since the initial writing of this document, the monorepo conversion has occurred, and the assembler will be implemented as a package that plugs into the app through well-defined socket interfaces. All packages should have an AGENTS.md file that documents their boundary contracts and purpose which is updated as the package evolves.

Adding a new segment should require:

1. Creating a segment definition (content + policy)
2. Registering it with the assembler

No editing of `buildSystem()`, the API route, or the client. Ever.

### Segment Type Definition

```typescript
// src/lib/prompt-assembly/types.ts

export type InjectionPolicy =
  | { type: "always" }
  | { type: "every_n"; n: number }
  | { type: "on_topic"; keywords: string[] }
  | { type: "on_state_field"; field: string }  // inject when this state field is non-empty
  | { type: "custom"; evaluate: (ctx: AssemblyContext) => boolean };

export type SegmentPriority = "critical" | "high" | "normal" | "low";

export interface PromptSegment {
  /** Unique identifier, e.g. "core_rules", "appearance_visual" */
  id: string;

  /** Human-readable name for UI/logging */
  label: string;

  /** The actual text content of this segment */
  content: string;

  /** When should this segment be included? */
  policy: InjectionPolicy;

  /** Relative importance — critical segments are never dropped under budget pressure */
  priority: SegmentPriority;

  /** Optional ordering weight (lower = earlier in assembled prompt) */
  order: number;

  /** Approximate token count (can be computed once on registration) */
  tokenEstimate: number;

  /**
   * Optional category for grouping in UI and for the "omitted segments" summary.
   * e.g. "character", "rules", "world", "style"
   */
  category: string;
}

export interface AssemblyContext {
  /** Current turn number */
  turnNumber: number;

  /** Map of segment ID → turn number when it was last included */
  lastIncludedAt: Record<string, number>;

  /** The user's current message text (for topic detection) */
  currentUserMessage: string;

  /** Current story state fields (for on_state_field checks) */
  stateFields: Record<string, string>;

  /** Total token budget for the system prompt */
  tokenBudget: number;
}

export interface AssemblyResult {
  /** The assembled system prompt string */
  systemPrompt: string;

  /** IDs of segments that were included */
  included: string[];

  /** IDs of segments that were omitted (with reasons) */
  omitted: { id: string; reason: string }[];

  /** Approximate total tokens used */
  tokenCount: number;
}
```

### The Assembler

```typescript
// src/lib/prompt-assembly/assembler.ts

export class PromptAssembler {
  private segments: Map<string, PromptSegment> = new Map();

  /** Register a segment. Idempotent — re-registering updates the segment. */
  register(segment: PromptSegment): this { ... }

  /** Remove a segment by ID. */
  unregister(id: string): this { ... }

  /** Assemble the prompt for a given context. */
  assemble(ctx: AssemblyContext): AssemblyResult { ... }

  /** List all registered segments (for UI display). */
  listSegments(): PromptSegment[] { ... }
}
```

Assembly algorithm:

1. Evaluate each segment's policy against the `AssemblyContext`
2. Separate into `eligible` (policy fires) and `ineligible` (policy doesn't fire)
3. Sort eligible by priority (critical → low), then by `order`
4. Greedily add segments until `tokenBudget` is reached
5. All `critical` segments are always included (budget overflow is allowed for critical)
6. Generate a one-line "omitted context" note listing what was skipped: `"[Established context for appearance, backstory available but not injected this turn.]"`
7. Return `AssemblyResult` with the full string, included/omitted lists, and token count

### Segment Registry (Replaces Monolithic `DEFAULT_SYSTEM_PROMPT`)

The current system prompt is split into segments. Each is defined as a standalone object:

```typescript
// src/lib/prompt-assembly/segments/core-rules.ts
export const coreRulesSegment: PromptSegment = {
  id: "core_rules",
  label: "Core Narration Rules",
  content: `You are the Narrator and all non-player characters (NPCs).\n\n- A 'turn' consists of...`,
  policy: { type: "always" },
  priority: "critical",
  order: 0,
  tokenEstimate: 350,
  category: "rules",
};
```

Proposed segment split of the current system prompt:

| Segment ID | Category | Tokens (est.) | Default Policy | Notes |
| --- | --- | --- | --- | --- |
| `core_rules` | rules | ~350 | `always` | Player/NPC rules, consent, pacing |
| `output_format` | rules | ~150 | `always` | Present tense, paragraph structure |
| `setting_premise` | world | ~80 | `always` | Tone, premise sentence |
| `character_identity` | character | ~120 | `always` | Name, age, occupation, core traits |
| `speech_patterns` | character | ~350 | `every_n(2)` | Rhythm, intonation, sentence shape |
| `vocabulary_humor` | character | ~200 | `every_n(2)` | Register, signature moves |
| `mannerisms` | character | ~150 | `every_n(3)` | Facial, body language, hands |
| `appearance_visual` | character | ~300 | `every_n(8)` | Look/presence, build |
| `outfit_hairstyle` | character | ~250 | `every_n(8)` | Current clothing, hair |
| `voice_sound` | character | ~200 | `on_topic(["voice", "sing", "song", "sound", "whisper", "tone"])` | Pitch, texture, articulation |
| `backstory` | world | ~200 | `every_n(10)` | Shared history, school days |
| `interaction_guide` | character | ~200 | `every_n(3)` | How she handles recognition, trust |
| `relationship_status` | world | ~100 | `on_state_field("relationships")` | Tyler, initial dynamic |

### Adding New Segments (The Plug-and-Play Flow)

To add dialogue examples, rapport guidance, or any future context type:

```typescript
// src/lib/prompt-assembly/segments/dialogue-examples.ts
export const dialogueExamplesSegment: PromptSegment = {
  id: "dialogue_examples",
  label: "NPC Dialogue Examples",
  content: loadDialogueFile("sabrina"),  // loads from prompts/ directory
  policy: { type: "every_n", n: 3 },
  priority: "normal",
  order: 50,
  tokenEstimate: 400,
  category: "character",
};
```

Then in the registry:

```typescript
assembler.register(dialogueExamplesSegment);
```

That's it. No other files need to change. The assembler picks it up on the next request.

### Integration with `route.ts`

The API route changes from:

```typescript
system: buildSystem(systemPrompt, storyState),
```

To:

```typescript
const result = assembler.assemble({
  turnNumber,
  lastIncludedAt: turnTracker,   // persisted per-conversation
  currentUserMessage: lastUserMsg,
  stateFields: parseStateFields(storyState),
  tokenBudget: 2500,
});
// Story state is injected separately (see Part 2)
system: result.systemPrompt + "\n\n## Current Story State\n" + storyState,
```

The turn tracker (`lastIncludedAt`) is a simple `Record<string, number>` stored in conversation state. It records when each segment was last sent, so `every_n` policies work across turns.

### File Structure

```
src/lib/prompt-assembly/
├── types.ts                    # PromptSegment, AssemblyContext, etc.
├── assembler.ts                # PromptAssembler class
├── token-estimator.ts          # Lightweight char-based token estimator
├── topic-detector.ts           # Keyword + future embedding-based topic matching
└── segments/
    ├── index.ts                # Exports all segments, registers with assembler
    ├── core-rules.ts
    ├── output-format.ts
    ├── setting-premise.ts
    ├── character-identity.ts
    ├── speech-patterns.ts
    ├── vocabulary-humor.ts
    ├── mannerisms.ts
    ├── appearance-visual.ts
    ├── outfit-hairstyle.ts
    ├── voice-sound.ts
    ├── backstory.ts
    ├── interaction-guide.ts
    └── relationship-status.ts
```

### Scalability Considerations

- **Multi-NPC**: When adding a second NPC, their segments follow the same pattern. The `category` and `id` namespace prevents collisions: `"sabrina.speech_patterns"`, `"alex.speech_patterns"`.
- **Dynamic segments**: Segments can be created at runtime from imported files. The dialogue examples feature (from `plan-npc-systems.md`) becomes a segment factory: read file → create `PromptSegment` → register.
- **Token budgeting**: The assembler enforces a total budget. As more segments are added, lower-priority ones are dropped before higher-priority ones. This means adding new segments doesn't require manually shrinking old ones.
- **Observability**: The `AssemblyResult` provides a manifest of what was included/omitted per turn. This can be logged server-side and optionally surfaced in a debug panel in the UI.

---

## Part 2: Intelligent State Building

This part addresses how story state is *constructed*, *validated*, and *updated* — not just how it's injected.

### Problem: The LLM as State Author

The current summarizer is the sole author of story state updates. It reads the conversation history and produces a new state block. This has three failure modes:

1. **Hallucination** — The LLM invents details not established in conversation (e.g., adding a character who was only vaguely alluded to, or fabricating relationship dynamics)
2. **Omission** — The LLM drops established facts when the story state grows too long for the output budget
3. **Drift** — Small inaccuracies compound across multiple summarization cycles, gradually warping the canonical state

### Solution: Multi-Stage State Pipeline

Instead of a single LLM call that does everything, decompose state building into stages that can be validated independently.

#### Stage 1: Fact Extraction (New)

A focused LLM call that reads recent messages and extracts **only new facts** as structured claims:

```json
{
  "facts": [
    { "type": "scene_change", "detail": "Moved from café to Sabrina's hotel lobby", "source_turn": 34 },
    { "type": "relationship_shift", "detail": "Sabrina opened up about missing Brian", "source_turn": 36 },
    { "type": "appearance_change", "detail": "Sabrina took off her blazer, now wearing just the graphic tee", "source_turn": 35 },
    { "type": "new_thread", "detail": "Brian mentioned his failed startup — Sabrina wants to know more", "source_turn": 37 }
  ]
}
```

**Why structured output**: This constrains the LLM's output to specific, verifiable claims with source turn attribution. It's much harder for the model to hallucinate when it must cite which turn the fact came from.

**Skunk prototype**: Use the same model with a focused instruction: *"Extract new facts from the last N messages. Output JSON. Each fact must reference the turn where it was established. Do not infer — only extract what was explicitly stated or clearly demonstrated."*

#### Stage 2: State Merge (New)

A deterministic (or LLM-assisted) merge of extracted facts into the existing state:

- **Deterministic merges**: Scene changes overwrite the Scene section. New characters are appended to Cast. New hard facts are appended.
- **LLM-assisted merges**: Relationship updates and demeanor changes require the LLM to integrate new information with existing context — but the input is constrained (existing state + extracted facts only, not the full conversation).

**Why two stages**: The merge step operates on a much smaller input (existing state + fact list) than the current approach (full system prompt + full state + all messages). This means:

- Fewer input tokens = lower cost per update
- Constrained input = less room for hallucination
- Deterministic paths for simple operations = zero hallucination for those fields

#### Stage 3: Validation (New)

After the merge produces a candidate state, validate it:

1. **Schema validation** — Does the output have all required sections? Are sections non-empty?
2. **Preservation check** — Are all hard facts from the previous state still present? (Simple substring/line check)
3. **Novelty check** — Did any new hard facts appear that weren't in the extracted facts? (Detects hallucination)
4. **Length check** — Is the output complete or was it truncated? (See truncation fix below)
5. **Semantic consistency** — Optional: use embeddings to check that the new state doesn't contradict the old state on preserved fields

**Skunk prototype**: Start with checks 1–4, which are all deterministic string operations. No LLM call needed for validation.

#### Stage 4: Auto-Accept with Confidence Scoring (New)

Instead of requiring user review, the system auto-accepts updates that pass validation with high confidence:

- **Auto-accept**: All validation checks pass, total diff is < 30% of state, no hard facts were removed → apply automatically
- **Flag for review**: Validation mostly passes but something looks off (e.g., a hard fact was removed, or > 50% of state changed) → apply but flag in history
- **Reject and retry**: Schema validation fails, or output is truncated → retry the pipeline automatically

The user is never interrupted. All updates flow into a **state history** (see Part 3).

### Parallel Execution

Currently, summarization is triggered by `useSummarization` after the chat response completes, and it blocks UI interaction with a pending review modal.

**New architecture**: The state update pipeline runs in a background worker, decoupled from the chat flow.

#### Implementation

```
User sends message
     │
     ├──────────────────────────────┐
     ▼                              ▼
  /api/chat (streaming)        State Pipeline (background)
  Returns to user immediately   Triggered after assistant
  No interruption               response is complete
     │                              │
     │                         ┌────┴────┐
     │                         │ Extract  │ Stage 1
     │                         │ facts    │
     │                         └────┬────┘
     │                         ┌────┴────┐
     │                         │ Merge    │ Stage 2
     │                         │ into     │
     │                         │ state    │
     │                         └────┬────┘
     │                         ┌────┴────┐
     │                         │ Validate │ Stage 3
     │                         └────┬────┘
     │                         ┌────┴────┐
     │                         │ Auto-    │ Stage 4
     │                         │ accept/  │
     │                         │ reject   │
     │                         └────┬────┘
     │                              │
     │                              ▼
     │                    State updated silently
     │                    Diff added to history
     ▼
  User continues chatting
  (uninterrupted)
```

#### Server-Side Implementation

Create a new API route: `/api/state-update`

This endpoint:

1. Receives messages + current state
2. Runs the 4-stage pipeline
3. Returns the validated new state, the extracted facts, and the validation report
4. The client applies it silently if validation passed

The client triggers this via a fire-and-forget `fetch()` after each assistant response. No `await` blocking the chat flow.

**Trigger policy**: Run after every assistant response (not just every N turns). The fact extraction stage is lightweight, and running frequently means each update is a small delta — less room for error than a big catch-up every 15 turns.

If we do need to throttle:

- Run fact extraction every turn (cheap, focused)
- Run full state merge + validation every 3–5 turns, accumulating facts in between
- This gives us a "fact buffer" that gets flushed into state periodically

### Anti-Hallucination Measures (Detail)

Beyond the pipeline structure, specific techniques to reduce state invention:

1. **Source-turn attribution**: Every extracted fact must cite a turn number. The validator can spot-check that the cited turn exists and contains relevant content.

2. **Closed-world assumption instruction**: The fact extractor is explicitly told: *"You may only extract facts that are directly stated or clearly demonstrated in the provided messages. Do not infer motivations, predict future events, or speculate about off-screen happenings. If something is ambiguous, do not extract it."*

3. **Diff-based merge, not rewrite**: Instead of asking the LLM to rewrite the entire state (current approach), the merge stage patches the existing state. This means the LLM only needs to decide *where* to insert new facts, not reproduce the entire document. Reproduction is where most drift and omission occurs.

4. **Hard fact immutability**: Hard facts can only be *added* by the pipeline. Removal requires an explicit contradiction detected in conversation + LLM justification. The validator enforces this.

5. **Fact deduplication**: Before merging, check if an extracted fact is already represented in state. If it is, skip it. This prevents the state from growing unboundedly with redundant information.

6. **Confidence thresholds for extraction**: The extractor can output a confidence score per fact. Low-confidence facts (e.g., "Brian seemed uncomfortable" — inferred, not stated) are held in a separate buffer and only promoted to state if corroborated in later turns.

---

## Part 3: State History and Diff UI

### Current UX Problem

The story state review modal interrupts the chat flow. The user must stop roleplaying, review a diff, decide on each hunk, and accept/reject. This is great for a development/testing workflow but hostile to a production roleplay experience.

### New UX Model

- **State updates happen silently** — the user is never interrupted
- **A subtle indicator** shows that state was updated (e.g., the Story State tab label shows a small dot, or the "Last updated" timestamp pulses briefly)
- **State History button** — a new button in the Story State sidebar tab that opens a scrollable history of all state changes
- **Each history entry shows**:
  - Timestamp
  - Turn number range (which messages this update was based on)
  - Compact diff (added lines in green, removed in red)
  - Validation status (auto-accepted, flagged, retried)
  - Extracted facts that drove the update
- **History is read-only** — no accept/reject buttons. The user can browse to understand how state evolved, but they don't need to act on it.
- **Manual override** — the user can still directly edit the Story State text area at any time. Manual edits are logged in history as "manual edit" entries.

### State History Data Model

```typescript
// src/lib/state-history.ts

export interface StateHistoryEntry {
  id: string;
  timestamp: string;
  turnRange: [number, number];       // [fromTurn, toTurn]
  previousState: string;
  newState: string;
  extractedFacts: ExtractedFact[];
  validationReport: ValidationReport;
  disposition: "auto_accepted" | "flagged" | "retried" | "manual_edit";
}

export interface ExtractedFact {
  type: string;
  detail: string;
  sourceTurn: number;
  confidence: number;
}

export interface ValidationReport {
  schemaValid: boolean;
  allHardFactsPreserved: boolean;
  noUnknownFacts: boolean;
  outputComplete: boolean;   // not truncated
  diffPercentage: number;    // % of state that changed
}
```

History is stored per-conversation in localStorage alongside the existing conversation data.

### UI Component

```
┌─────────────────────────────────────────┐
│ Story State                    [History] │
│ Last updated: Feb 13, 11:42 AM          │
├─────────────────────────────────────────┤
│                                         │
│ [Current story state text area]         │
│                                         │
└─────────────────────────────────────────┘

Clicking [History] opens:

┌─────────────────────────────────────────┐
│ State History                    [Close] │
├─────────────────────────────────────────┤
│ ▸ Turn 45 → 48 · Feb 13 11:42 AM       │
│   Auto-accepted · 3 facts extracted     │
│                                         │
│ ▸ Turn 30 → 44 · Feb 13 11:28 AM       │
│   Auto-accepted · 7 facts extracted     │
│                                         │
│ ▸ Turn 15 → 29 · Feb 13 11:15 AM       │
│   Flagged: hard fact removed · 5 facts  │
│                                         │
│ ▸ Manual edit · Feb 13 11:10 AM         │
│   User edited scene location            │
└─────────────────────────────────────────┘

Expanding an entry:

┌─────────────────────────────────────────┐
│ ▾ Turn 45 → 48 · Feb 13 11:42 AM       │
│   Auto-accepted · 3 facts extracted     │
│                                         │
│   Facts:                                │
│   • scene_change: Moved to hotel lobby  │
│   • appearance: Blazer removed          │
│   • new_thread: Brian's startup         │
│                                         │
│   Diff:                                 │
│   ## Scene                              │
│ - Where/When: Café, late afternoon      │
│ + Where/When: Hotel lobby, evening      │
│   ## Appearance                         │
│ + Sabrina — blazer: removed, now in     │
│ +   graphic tee only                    │
└─────────────────────────────────────────┘
```

### Migration from Current Review System

The current `StoryStateReview` component and per-hunk accept/reject flow is excellent code and should be preserved as an optional "manual review mode" toggled via a setting:

- **Production mode** (default): auto-accept + history
- **Review mode**: current behavior with diff hunks

This avoids throwing away working code and gives power users a manual control path.

---

## Part 4: State Truncation Diagnosis and Fix

### Diagnosis

The story state sometimes gets cut off during summarization. After examining the pipeline, there are three likely causes, and all three may contribute:

#### Cause 1: `maxOutputTokens: 1024` is too low

The `SUMMARIZE_INSTRUCTION` in `src/app/api/summarize/route.ts` asks for 7 sections (Cast, Relationships, Appearance, Scene, Current Demeanor, Open Threads, Hard Facts). As the story accumulates characters, relationships, and facts, the state grows. 1024 tokens is tight for a rich state. Additionally:

- The instruction says "Keep it under 800 tokens" but 7 sections with real content easily exceed this
- Some providers count reasoning tokens against `maxOutputTokens`. With `reasoning: { effort: "medium" }`, the model may burn 200–400 tokens on reasoning before starting output, leaving only 600–800 for the actual state

**Evidence**: The text being cut off mid-sentence or mid-section is the signature of hitting a token limit. If the model simply chose to stop, it would end at a natural boundary.

#### Cause 2: No finish reason detection

The current code checks for empty responses but not for truncated ones:

```typescript
// Current: only checks for empty
if (!result.text.trim()) {
  // retry once
}
```

The Vercel AI SDK's `generateText` returns a `finishReason` field. When the model is cut off by hitting `maxOutputTokens`, `finishReason` is `"length"` instead of `"stop"`. This is never checked.

#### Cause 3: Provider timeout or connection issues

Some OpenRouter providers may have aggressive timeouts for `generateText` calls. If the model is slow (especially with reasoning), the connection could be dropped before the full response is received. The current error handling catches thrown errors but not silent truncation from a dropped connection.

### Fix (Multi-Layer)

#### Fix 1: Increase `maxOutputTokens` for summarization

Change from `1024` to `2048`. The instruction can also be updated to say "Keep it under 1200 tokens" to give more room while still encouraging conciseness.

```typescript
// src/app/api/summarize/route.ts
maxOutputTokens: 2048,
```

#### Fix 2: Check `finishReason` and retry on truncation

```typescript
let result = await generate();

// Retry on truncation, not just empty
if (result.finishReason === "length" || !result.text.trim()) {
  console.warn(`⚠ /api/summarize: ${result.finishReason === "length" ? "truncated" : "empty"}, retrying…`);
  result = await generate();
}

// If still truncated, try with even higher token limit
if (result.finishReason === "length") {
  console.warn(`⚠ /api/summarize: still truncated, retrying with higher limit…`);
  result = await generateText({
    ...generateOptions,
    maxOutputTokens: 4096,
  });
}
```

#### Fix 3: Structural completeness check

After receiving the response, verify all 7 required sections are present:

```typescript
const REQUIRED_SECTIONS = [
  "## Cast", "## Relationships", "## Appearance", "## Scene",
  "## Current Demeanor", "## Open Threads", "## Hard Facts",
];

function isStateComplete(text: string): boolean {
  return REQUIRED_SECTIONS.every(section => text.includes(section));
}

// Use in the response handling:
if (!isStateComplete(result.text)) {
  // The output is missing sections — likely truncated even if finishReason is "stop"
  // Retry with higher token limit
}
```

#### Fix 4: In the multi-stage pipeline (Part 2), truncation becomes less likely

When state updates become incremental patches rather than full rewrites, the output is naturally shorter. A fact extraction call produces a small JSON array. A merge call only touches the sections that changed. Neither is likely to hit a token limit.

---

## Part 5: Additional Features and Improvements

### 5.1 — Token Budget Dashboard

The assembler produces an `AssemblyResult` with token counts per segment. Surface this in the UI:

- Show a stacked bar chart in the Settings panel: how many tokens go to rules, character, world, state, messages
- Highlight when the budget is tight (many segments being dropped)
- Let the user adjust the total token budget

### 5.2 — State Field Subscriptions for Segments

Prompt segments can subscribe to specific state fields. When a field changes (e.g., Scene changes from "café" to "hotel lobby"), segments that reference that field are automatically promoted to inject on the next turn.

Example: The `outfit_hairstyle` segment subscribes to the `appearance` state field. When the state pipeline detects an appearance change, `outfit_hairstyle` is injected on the next turn even if its `every_n` policy wouldn't normally fire.

### 5.3 — Segment Effectiveness Tracking

Log which segments were included on each turn and correlate with output quality metrics (user edits, retries, continuity failures). Over time, this data reveals:

- Which segments the model actually uses (vs ignoring)
- Whether `every_n` intervals are tuned correctly
- Whether topic detection is catching the right triggers

### 5.4 — Cascade State Updates

When fact extraction detects a scene change, it can trigger a cascade:

- Scene change → refresh appearance segment → update atmosphere in state → adjust demeanor

This makes the state pipeline reactive rather than periodic. The system becomes aware that certain facts imply other changes.

### 5.5 — State Snapshots and Branching

When the user forks a conversation (existing feature in the plan), the state history enables clean branching: fork from any state snapshot, not just the current state. This gives the user the ability to "rewind" to a specific point in the story's state evolution.

### 5.6 — Summarizer Specialization per Section

Instead of one LLM call that produces all 7 sections, run specialized calls per section type:

- **Cast updater**: focused on character additions/changes only
- **Relationship analyzer**: focused on dynamic shifts and trust
- **Scene tracker**: focused on location, time, atmosphere
- **Thread manager**: focused on which hooks are open/closed

Each specialist is a shorter, more focused prompt → less hallucination, more precision. They can run in parallel. The merge stage combines their outputs.

This is an advanced version of the multi-stage pipeline that fully decomposes the monolithic summarizer.

---

## Build Sequence

### Phase 0: Fix truncation (1 day)

1. Increase `maxOutputTokens` to 2048 in `/api/summarize`
2. Add `finishReason` check and retry on truncation
3. Add structural completeness check for required sections
4. Log reasoning token usage to confirm provider behavior

### Phase 1: Prompt assembler skeleton (2-3 days)

1. Create `src/lib/prompt-assembly/types.ts` with type definitions
2. Create `src/lib/prompt-assembly/assembler.ts` with the `PromptAssembler` class
3. Split `DEFAULT_SYSTEM_PROMPT` into segment files
4. Create segment registry (`segments/index.ts`)
5. Replace `buildSystem()` in `route.ts` with assembler call
6. Add turn tracker to conversation state
7. Implement `always` and `every_n` policies

### Phase 2: State pipeline v0 (3-5 days)

1. Create `/api/state-update` route with fact extraction stage
2. Create merge stage (deterministic for simple fields, LLM for complex)
3. Create validation stage (schema + preservation + completeness checks)
4. Create auto-accept logic with confidence scoring
5. Wire up fire-and-forget trigger in the client after assistant responses
6. Add state history data model and localStorage persistence

### Phase 3: UI updates (2-3 days)

1. Add State History component to the Story State sidebar tab
2. Add production/review mode toggle in Settings
3. Remove blocking review modal in production mode
4. Add subtle "state updated" indicator
5. Keep existing `StoryStateReview` component for review mode

### Phase 4: Advanced assembly (2-3 days)

1. Implement `on_topic` policy with keyword detection
2. Implement `on_state_field` policy
3. Add token budget enforcement to the assembler
4. Add "omitted context" summary note generation
5. Add segment effectiveness logging

### Phase 5: Pipeline sophistication (ongoing)

1. Add confidence scoring to fact extraction
2. Add cascade triggers (scene change → appearance refresh)
3. Add fact deduplication
4. Add per-section specialized summarizers
5. Embedding-based topic detection for `on_topic` policy

---

## Relationship to Other Tracks

- **Track A (Message History)**: The prompt assembler and state pipeline are independent of how message history is compressed. They compose naturally — the assembler handles the system prompt, Track A handles the message array, and both feed into the final request.
- **Track C (Meta-Architecture)**: The dual-model context compiler from Track C could eventually subsume the assembler's topic detection — using a small model to decide which segments to inject instead of keyword heuristics. The assembler's `custom` policy type is the extension point for this.
- **NPC Systems Plan**: The dialogue examples feature from `plan-npc-systems.md` becomes a segment registration. Rapport tracking becomes a state pipeline stage. Appearance refresh becomes a state field subscription triggering segment injection. All three planned features fit cleanly into Track B's architecture.
