---
Status: Accepted
Last Updated: 2026-02-14 14:45
---
# IM02 — Story State Atomization

## Origin

tbd.md Phase 2 Item #2:

> Further parse the story state and system prompt areas in the UI and in the prompt assembly code to make them more readable and easier to work with, but also potentially more useful for inference. For example, in the `cast` section of the story state, we could have a separate sub-container for each NPC and the player which can be edited separately without accidentally affecting other actors. The same atomization can be thought about for other sections and the system prompt (which is currently not broken up the way story state is)

## Current state

**System prompt** — already atomized on the backend but needs to be reflected on the web UI the way the story state is. The `PromptAssembler` + `SerializedSegment[]` system breaks the system prompt into ~13 individually editable segments with injection policies, token budgets, and per-segment UI cards. No further work needed here.

**Story state** — partially atomized. The UI now splits by `## ` headings into collapsible section cards (Cast, Scene, Relationships, Appearance, etc.). However, *within* each section, content is a flat markdown blob. This means:

- **Cast**: All actors are bullet points in one textarea. Editing one actor risks accidentally breaking another.
- **Relationships**: Multiple `char → target` entries in one block. Adding/editing one relationship means scrolling through all of them.
- **Appearance**: Multiple `char — attribute` lines in one block. Changing an outfit means finding it among hair, tattoos, notable attributes, etc.
- **State pipeline merge**: The LLM receives per-section merge instructions but must parse individual entities out of the flat text itself. This is where hallucination and accidental deletion happen most.

## Goal

Replace the flat markdown story state with a **structured JSON data model** that is:
1. Individually editable in the UI per-entity (per-actor, per-relationship, per-attribute)
2. Directly targetable by the state pipeline for precise merge/update operations
3. Serialized to markdown only at the point of LLM injection (chat route)

---

## Research: does format actually matter for inference?

Before committing to a structured model, we need to know whether the format we inject into the LLM's system prompt actually affects inference quality. The answer is nuanced.

### Key findings from the literature

**1. Microsoft/MIT (2024) — "Does Prompt Formatting Have Any Impact on LLM Performance?"**
- Tested plain text, Markdown, JSON, YAML across GPT-3.5 and GPT-4 on reasoning, code gen, and translation tasks.
- Performance varied **up to 40%** on GPT-3.5-turbo depending on format. GPT-4 was more robust but still showed statistically significant differences (p < 0.01).
- **No single format won universally.** The best format varied by task and model.
- Conclusion: "The way prompts are formatted significantly impacts GPT-based models' performance, with no single format excelling universally."

**2. ImprovingAgents (2025) — "Which Nested Data Format Do LLMs Understand Best?"**
- Tested JSON, YAML, XML, Markdown on GPT-5 Nano, Llama 3.2 3B, Gemini 2.5 Flash Lite with nested data comprehension tasks.
- **Markdown was the most token-efficient** format across all models (34-38% fewer tokens than JSON).
- **JSON performed poorly** on GPT-5 Nano and Gemini 2.5 Flash Lite. Only Llama showed no format preference.
- **YAML was the best overall for accuracy** on 2 of 3 models.
- Markdown achieved "generally good" accuracy while being cheapest.

**3. Vanderbilt (2025) — "Prompt engineering for structured data"**
- Tested JSON, YAML, CSV, function-calling, simple prefixes, and hybrid approaches across ChatGPT-4o, Claude, and Gemini.
- "Hierarchical formats like JSON and YAML boost accuracy, while lightweight formats such as CSV and simple prefixes reduce token usage and latency."

**4. Mehmet Baykar (2025) — "Structured Prompts: How Format Impacts AI Performance"**
- GPT-4 achieved **81.2% accuracy with Markdown** vs **73.9% with JSON** on reasoning tasks.
- "Small formatting changes in AI prompts can boost accuracy from 85% to 98%."

### What this means for Chatterbox

The research consistently shows:

1. **Markdown is not inferior to JSON for LLM comprehension** — in fact, it's often equal or better, especially on larger models. GPT-4 class models (which GLM-5 competes with) are relatively format-robust.
2. **Markdown is significantly more token-efficient** (30-38% fewer tokens than JSON). For a story state that's injected every single request, this matters.
3. **JSON's structural benefits are for machines, not LLMs.** LLMs were trained on vast amounts of markdown (docs, READMEs, wikis). JSON's braces and quotes are syntactic noise that consumes tokens without aiding comprehension.
4. **The real win from structure is on the pipeline/UI side**, not the inference side.

### Conclusion on format

**Keep markdown as the LLM injection format.** The structured JSON model should be the internal representation for storage, UI, and pipeline operations. At the point of injection into the chat route, serialize to markdown. This gives us the best of both worlds:

- Structured data for precise UI editing and pipeline targeting
- Token-efficient, LLM-friendly markdown for inference
- No regression in inference quality

---

## Chosen approach: Structured state model with markdown injection

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Import .md  │────▶│  Parse into   │────▶│  Store as    │
│  file        │     │  Structured   │     │  JSON in     │
│              │     │  StoryState   │     │  localStorage │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
                    ┌──────────────┐              │
                    │  UI renders   │◀─────────────┤
                    │  typed forms  │              │
                    │  per entity   │              │
                    └──────────────┘              │
                                                 │
                    ┌──────────────┐              │
                    │  Pipeline     │◀─────────────┤
                    │  targets      │              │
                    │  specific     │              │
                    │  entities     │──────────────▶ (writes back to JSON)
                    └──────────────┘              │
                                                 │
                    ┌──────────────┐              │
                    │  Chat route   │◀─────────────┘
                    │  serializes   │
                    │  to markdown  │──────▶ LLM system prompt
                    └──────────────┘
```

### Data model

```ts
// --- Per-entity types ---

interface CastMember {
  name: string;
  description: string;
  isPlayer: boolean;
}

interface Relationship {
  from: string;
  to: string;
  description: string;
  /** Multi-line detail bullets (optional) */
  details: string[];
}

interface AppearanceEntry {
  character: string;
  attribute: string;  // "hair", "outfit", "overall vibe", "notable attributes", etc.
  description: string;
}

interface SceneInfo {
  location: string;
  present: string[];
  atmosphere: string;
}

interface DemeanorEntry {
  character: string;
  mood: string;
  energy: string;
}

interface StoryThread {
  description: string;
}

interface HardFact {
  fact: string;
}

// --- Top-level model ---

interface StructuredStoryState {
  cast: CastMember[];
  relationships: Relationship[];
  appearance: AppearanceEntry[];
  scene: SceneInfo;
  demeanor: DemeanorEntry[];
  openThreads: StoryThread[];
  hardFacts: HardFact[];
  style: string[];
  /** Catch-all for sections we don't have typed models for */
  custom: { heading: string; content: string }[];
}
```

The `custom` array preserves flexibility — any `## ` section in an imported file that doesn't match a known section type gets captured here and rendered as a freeform textarea, just like today.

### What changes

#### 1. New shared parser/serializer (new file)

`apps/web/src/lib/story-state-model.ts`

- `parseMarkdownToStructured(markdown: string): StructuredStoryState` — parses imported `.md` files into the structured model. Uses the existing `## ` splitting plus per-section sub-entry parsing (bullet patterns for Cast, Relationships, Appearance, etc.).
- `structuredToMarkdown(state: StructuredStoryState): string` — serializes back to markdown for LLM injection and for backward-compatible display.
- Type definitions for all entity types.

#### 2. Storage model update

`apps/web/src/lib/storage.ts`

- Add `structuredState: StructuredStoryState | null` to `Conversation`.
- Migration: existing conversations keep `storyState` string, `structuredState` is `null` until next import or pipeline update.
- `storyState` string is kept as a derived/cached field (regenerated from `structuredState` when structured data exists).

#### 3. State hooks update

`apps/web/src/lib/hooks/use-field-setters.ts`

- Add `structuredState` / `setStructuredState` state.
- Import handler: parse markdown → structured, store both.
- Per-entity update handlers: `handleCastUpdate(index, member)`, `handleRelationshipUpdate(index, rel)`, etc.
- When structured state changes, regenerate the `storyState` markdown string.

#### 4. UI: typed section editors

`apps/web/src/components/sidebar/story-state-editor.tsx`

Replace the current `SectionCard` textareas with typed sub-components when `structuredState` is available:

- **`CastSection`** — one card per `CastMember` with name input + description textarea. Player character flagged with a badge.
- **`RelationshipsSection`** — one card per `Relationship` with from/to labels + description textarea + detail bullets.
- **`AppearanceSection`** — one card per `AppearanceEntry` with character + attribute labels + description textarea.
- **`SceneSection`** — key-value fields: location, present (tag list), atmosphere.
- **`DemeanorSection`** — one card per character with mood + energy fields.
- **`ThreadsSection`** — list of thread descriptions with add/remove.
- **`HardFactsSection`** — list of fact strings with add/remove.
- **`StyleSection`** — list of rule strings.

Falls back to the current markdown textarea view when `structuredState` is null.

#### 5. Pipeline integration

`apps/web/src/lib/state-pipeline/section-merge.ts` + `state-update/route.ts`

- Fact extraction prompt: add `character` field to `ExtractedFact` type so facts can be routed to specific entities.
- Merge: instead of sending the entire story state to the merge LLM, send only the targeted entity's content. E.g., for an `appearance_change` fact about Sabrina, send only Sabrina's appearance entries.
- After merge: parse the LLM's response back into the specific entity fields and patch the structured state.
- Validation: per-entity validation instead of whole-document diff.

#### 6. Chat route

`apps/web/src/app/api/chat/route.ts`

- Accept `structuredState` from client (or fall back to `storyState` string).
- If structured, call `structuredToMarkdown()` to produce the injection string.
- `parseStateFields()` operates on the structured data directly instead of regex-splitting markdown.

#### 7. Conversation manager + transport

- `use-conversation-manager.ts`: hydrate/save `structuredState`.
- `liveConfig` / transport: send `structuredState` alongside (or instead of) `storyState`.

### Migration strategy

- Existing conversations: `structuredState` is `null`. The app continues to work with the raw `storyState` string exactly as today.
- On next import: the imported markdown is parsed into `structuredState`. From that point forward, the structured model is the source of truth.
- On next pipeline update: if `structuredState` exists, the pipeline operates on it directly. If not, it operates on the string as before.
- No breaking changes for existing data.

### Implementation order

1. **Types + parser/serializer** — `story-state-model.ts` with full round-trip tests (markdown → structured → markdown)
2. **Storage + hooks** — add `structuredState` to `Conversation`, update field setters and conversation manager
3. **UI section editors** — replace `SectionCard` textareas with typed components per section
4. **Chat route** — accept structured state, serialize to markdown for injection
5. **Pipeline integration** — per-entity fact routing and targeted merge
6. **Import flow** — parse imported `.md` → structured on import
7. **Verify** — `pnpm typecheck`, `pnpm lint`, `pnpm dev`, manual testing with both story state files
