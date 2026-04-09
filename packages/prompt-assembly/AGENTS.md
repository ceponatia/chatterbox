# AGENTS.md — `@chatterbox/prompt-assembly`

## Purpose

`@chatterbox/prompt-assembly` is the **segmented prompt assembly engine** for the app.

It provides:

- a `PromptAssembler` class that evaluates segment injection policies, enforces token budgets, and produces assembled system prompts
- type definitions for prompt segments, injection policies, serialized transport types, and assembly results
- a library of default segments extracted from the original monolithic system prompt
- a **markdown parser** (`src/parser.ts`) that converts monolithic system prompt files into `SerializedSegment[]` for the UI and transport
- serialization/deserialization between `PromptSegment` (runtime) and `SerializedSegment` (JSON-safe for localStorage/API)
- a `PromptAssemblySocket`-compatible adapter for integration through `@chatterbox/sockets`

This package replaces the monolithic `buildSystem()` concatenation with a component-based system where each piece of context is a self-contained segment with metadata describing when and how it should be injected.

## What belongs in this package

Allowed:

- `PromptSegment` definitions (content + policy + metadata)
- the `PromptAssembler` class and its assembly algorithm
- injection policy evaluation logic
- token estimation and topic detection helpers
- markdown parsing and segment extraction logic
- serialization/deserialization of segments for transport/storage
- the socket adapter bridging to `PromptAssemblySocket`

Not allowed:

- framework code (React hooks/components)
- route handlers / server runtime logic
- direct app state/storage imports
- SDK-specific types

## Public API and usage

Only import from the package root:

```ts
import {
  PromptAssembler,
  createDefaultAssembler,
  createAssemblerFromSerialized,
  parseSystemPromptToSegments,
  segmentsToMarkdown,
  segmentedPromptAssembly,
  type PromptSegment,
  type InjectionPolicy,
  type SerializedSegment,
  type SerializedPolicy,
} from "@chatterbox/prompt-assembly";
```

Do **not** deep-import internal files:

```ts
// ❌ forbidden
import { PromptAssembler } from "@chatterbox/prompt-assembly/src/assembler";
```

`src/index.ts` is the only public entry point.

## Dependency graph

```
@chatterbox/prompt-assembly → @chatterbox/sockets (types only)
```

This package depends on `@chatterbox/sockets` for the `AssemblyContext`, `AssemblyResult`, and `PromptAssemblySocket` types. It has no other runtime dependencies.

## Module layout

| File                 | Responsibility                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`           | All shared types: `PromptSegment`, `InjectionPolicy`, `SegmentPriority`, `SerializedSegment`, `SerializedPolicy`. Re-exports `AssemblyContext`/`AssemblyResult` from sockets. |
| `assembler.ts`       | `PromptAssembler` class — policy evaluation, sorting, token budget enforcement, omitted-context notes.                                                                        |
| `parser.ts`          | Markdown parser (`parseSystemPromptToSegments`, `segmentsToMarkdown`), serialization/deserialization (`deserializeSegment`, `createAssemblerFromSerialized`).                 |
| `parser-mappings.ts` | Static mapping data: `HEADING_MAPPINGS`, `SUB_SECTION_MAPPINGS`, `MERGE_GROUPS`. Defines how markdown headings map to segment IDs, policies, and metadata.                    |
| `token-estimator.ts` | `estimateTokens()` — character-based heuristic (~4 chars/token).                                                                                                              |
| `topic-detector.ts`  | `matchesTopicKeywords()` — word-boundary keyword matching with basic suffix stripping.                                                                                        |
| `socket-adapter.ts`  | `segmentedPromptAssembly` — adapts the assembler to the `PromptAssemblySocket` interface.                                                                                     |
| `segments/`          | Individual default segment definitions + `DEFAULT_SEGMENTS` array + `createDefaultAssembler()` factory.                                                                       |

## Key concepts

### Segments

A `PromptSegment` is a self-contained piece of context with:

- **content**: the actual text
- **policy**: when to inject (`always`, `every_n`, `on_topic`, `on_state_field`, `on_presence`, `custom`)
- **priority**: `critical` (never dropped) > `high` > `normal` > `low`
- **order**: numeric sort weight within the same priority tier
- **tokenEstimate**: approximate token count for budget enforcement
- **omittedSummary**: optional one-line hint appended in omitted-context notes

### Assembly algorithm

1. Evaluate each segment's policy against the `AssemblyContext`
2. Separate into eligible (policy fires) and ineligible
3. Sort eligible by priority then order
4. Greedily add segments until `tokenBudget` is reached (configurable via `Settings.tokenBudget`, default 2500)
5. Critical segments are always included (budget overflow allowed)
6. Generate an "omitted context" note grouped by category listing what was skipped (includes `omittedSummary` when present)

### Presence detection

- `on_presence` policies evaluate against `AssemblyContext.presentEntityIds`.
- Segment is included when `presentEntityIds` contains `policy.entityId`.

### Topic detection

Two-tier detection for `on_topic` segments:

1. **Keyword matching** (`src/topic-detector.ts`): word-boundary-aware matching with basic suffix stripping. Tokenizes the user message, stems each word, matches against keyword stems (handles plurals, verb forms). Multi-word phrases use substring matching.
2. **Semantic fallback** (`evaluateOnTopic` in `src/assembler.ts`): if keyword matching misses, checks `AssemblyContext.topicScores[segmentId]` — a pre-computed cosine similarity score (0.0–1.0) between the user message and the segment's topic description. Threshold: 0.5. Scores are computed server-side (in `apps/web`) via embedding model and passed through the context. The assembler itself makes no API calls.

### Default segment content

All default segments in `src/segments/` are **story-agnostic** — they use `{{ char }}`/`{{ user }}` placeholders and `[customize]` markers. They serve as a template when no custom segments are provided. No character-specific, plot-specific, or user-specific content should exist in these files.

### Segment policy assignments

| Segment                                                                | Policy                             | Priority      |
| ---------------------------------------------------------------------- | ---------------------------------- | ------------- |
| `core_rules`, `output_format`, `setting_premise`, `character_identity` | `always`                           | critical/high |
| `narration_guidelines`                                                 | `every_n(3)`                       | normal        |
| `speech_patterns`                                                      | `every_n(2)`                       | high          |
| `vocabulary_humor`, `mannerisms`                                       | `every_n(3)`                       | normal        |
| `interaction_guide`                                                    | `every_n(3)`                       | normal        |
| `appearance_visual`                                                    | `every_n(2)`                       | normal        |
| `outfit_hairstyle`                                                     | `every_n(2)`                       | normal        |
| `voice_sound`                                                          | `every_n(2)`                       | normal        |
| `backstory`                                                            | `on_topic` (remember, school, ...) | normal        |
| `relationship_status`                                                  | `on_state_field("relationships")`  | normal        |

`core_rules` must preserve strict non-authorship constraints for `{{ user }}` and honor runtime-provided player aliases as equivalent to `{{ user }}`.

### Markdown parser (`src/parser.ts`)

`parseSystemPromptToSegments(markdown)` converts a monolithic system prompt markdown file into `SerializedSegment[]` by:

1. Splitting by headings (`###`)
2. Matching heading text to known segment IDs via regex patterns (e.g. `Output format` → `output_format`) defined in `parser-mappings.ts`
3. Sub-parsing the character identity block into individual sub-sections (speech patterns, appearance, mannerisms, etc.) via bullet-prefix patterns
4. Applying merge groups to combine related sub-segments (vocabulary/humor, outfit/hairstyle) — merge definitions live in `MERGE_GROUPS` in `parser-mappings.ts`
5. Assigning default policies, priorities, and categories based on the heading mapping
6. Capturing unknown sections as generic `custom_N` segments with `always` policy

Additional heading mappings:

- `Narration Guidelines` headings map to the `narration_guidelines` segment (`every_n(3)`, `normal`, `rules` category).
- `NPC framing` headings map to the `npc_framing` segment (`always`, `high`, `character` category).
- `Background and scenario` headings match the same `backstory` segment as `Background and relationship` (`on_topic`, `normal`, `world` category).

`segmentsToMarkdown(segments)` converts segments back to flat markdown (non-mutating — copies before sorting).

`createAssemblerFromSerialized(segments)` creates a `PromptAssembler` from `SerializedSegment[]` by deserializing policies and registering all segments.

### SerializedSegment / SerializedPolicy

JSON-safe representations of `PromptSegment` / `InjectionPolicy` for localStorage persistence and API transport. Both types live in `types.ts`. `SerializedPolicy` excludes the `custom` policy variant (which contains a function) since functions aren't serializable. `SerializedPolicy` includes `on_presence`, and `SerializedSegment` includes optional `omittedSummary`.

### Adding a new segment

1. Create a segment file in `src/segments/`
2. Export it from `src/segments/index.ts`
3. Add it to the `DEFAULT_SEGMENTS` array
4. Re-export from `src/index.ts` if needed
5. Add a heading pattern to `HEADING_MAPPINGS` or `SUB_SECTION_MAPPINGS` in `src/parser-mappings.ts` so imported files are parsed correctly

No other files need to change. The assembler picks it up automatically.

### Adding a new merge group

If a set of parsed sub-segments should be combined into one segment, add an entry to `MERGE_GROUPS` in `src/parser-mappings.ts` specifying `sourceIds` and the `merged` segment metadata. The parser applies all merge groups automatically.

## Validation checklist

Before merging changes, verify:

- `pnpm --filter @chatterbox/prompt-assembly typecheck`
- `pnpm --filter @chatterbox/prompt-assembly lint`
- app still compiles when consuming from `@chatterbox/prompt-assembly` root exports only
- all segments in `DEFAULT_SEGMENTS` produce the same content as the original `DEFAULT_SYSTEM_PROMPT` when assembled with `always` policies
- Package tooling relies on the `typescript-eslint` meta package; do not add a direct `@typescript-eslint/parser` dependency unless a config explicitly needs it.
