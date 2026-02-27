# AGENTS.md — `@chatterbox/prompt-assembly`

## Purpose

`@chatterbox/prompt-assembly` is the **segmented prompt assembly engine** for the app.

It provides:

- a `PromptAssembler` class that evaluates segment injection policies, enforces token budgets, and produces assembled system prompts
- type definitions for prompt segments, injection policies, and assembly results
- a library of default segments extracted from the original monolithic system prompt
- a `PromptAssemblySocket`-compatible adapter for integration through `@chatterbox/sockets`

This package replaces the monolithic `buildSystem()` concatenation with a component-based system where each piece of context is a self-contained segment with metadata describing when and how it should be injected.

## What belongs in this package

Allowed:

- `PromptSegment` definitions (content + policy + metadata)
- the `PromptAssembler` class and its assembly algorithm
- injection policy evaluation logic
- token estimation and topic detection helpers
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
  segmentedPromptAssembly,
  type PromptSegment,
  type InjectionPolicy,
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

## Key concepts

### Segments

A `PromptSegment` is a self-contained piece of context with:
- **content**: the actual text
- **policy**: when to inject (`always`, `every_n`, `on_topic`, `on_state_field`, `custom`)
- **priority**: `critical` (never dropped) > `high` > `normal` > `low`
- **order**: numeric sort weight within the same priority tier
- **tokenEstimate**: approximate token count for budget enforcement

### Assembly algorithm

1. Evaluate each segment's policy against the `AssemblyContext`
2. Separate into eligible (policy fires) and ineligible
3. Sort eligible by priority then order
4. Greedily add segments until `tokenBudget` is reached (configurable via `Settings.tokenBudget`, default 2500)
5. Critical segments are always included (budget overflow allowed)
6. Generate an "omitted context" note grouped by category listing what was skipped

### Topic detection (Phase 4)

`src/topic-detector.ts` provides word-boundary-aware keyword matching with basic suffix stripping:
- Tokenizes the user message into words, stems each word
- Matches against keyword stems (handles plurals, verb forms: "singing" → "sing")
- Multi-word phrases use substring matching (e.g. "middle school")
- Used by `on_topic` policy on: `voice_sound`, `appearance_visual`, `outfit_hairstyle`, `backstory`

### Segment policy assignments

| Segment | Policy | Priority |
|---------|--------|----------|
| `core_rules`, `output_format`, `setting_premise`, `character_identity` | `always` | critical/high |
| `speech_patterns` | `every_n(2)` | high |
| `vocabulary_humor`, `mannerisms` | `every_n(3)` | normal |
| `interaction_guide` | `every_n(3)` | normal |
| `appearance_visual` | `on_topic` (look, face, eyes, ...) | normal |
| `outfit_hairstyle` | `on_topic` (outfit, wear, clothes, ...) | normal |
| `voice_sound` | `on_topic` (voice, sing, song, ...) | normal |
| `backstory` | `on_topic` (remember, school, ...) | normal |
| `relationship_status` | `on_state_field("relationships")` | normal |

### Adding a new segment

1. Create a segment file in `src/segments/`
2. Export it from `src/segments/index.ts`
3. Add it to the `DEFAULT_SEGMENTS` array
4. Re-export from `src/index.ts` if needed

No other files need to change. The assembler picks it up automatically.

## Validation checklist

Before merging changes, verify:

- `pnpm --filter @chatterbox/prompt-assembly typecheck`
- `pnpm --filter @chatterbox/prompt-assembly lint`
- app still compiles when consuming from `@chatterbox/prompt-assembly` root exports only
- all segments in `DEFAULT_SEGMENTS` produce the same content as the original `DEFAULT_SYSTEM_PROMPT` when assembled with `always` policies
