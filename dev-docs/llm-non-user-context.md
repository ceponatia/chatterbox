# LLM Non-User Context: Current State and Planned Evolution

## Purpose

This document catalogs everything currently sent to the model that is **not** the player's free-text input, and maps the planned additions from `dev-docs/plan-npc-systems.md`.

Use this as a research baseline for moving from flat prompt tokens toward more robust context systems (structured memory, retrieval, state machines, policy layers).

---

## Scope: What Counts as "Non-User Context"

Included:

- System prompt content
- Story State content
- Summarizer instructions
- Provider/model/parameter constraints
- Message windowing and request shaping
- Any planned non-user context blocks (rapport, dialogue examples, appearance refresh hints)

Excluded:

- Direct, raw user message text entered in chat input

---

## Current Runtime Pipelines

## A) Chat generation pipeline (`/api/chat`)

### Current non-user inputs to the model

1. **System prompt text**
   - Source: UI state (`liveConfig.systemPrompt`) from `page.tsx`
   - Default seed: `DEFAULT_SYSTEM_PROMPT` in `src/lib/defaults.ts`

2. **Story State text**
   - Source: UI state (`liveConfig.storyState`) from `page.tsx`
   - Default seed: `DEFAULT_STORY_STATE` in `src/lib/defaults.ts`
   - Injection method: server concatenates system + `## Current Story State` block via `buildSystem()`.

3. **Model settings (sampling/output constraints)**
   - temperature, max tokens, top-p, frequency penalty, presence penalty
   - Source: `liveConfig.settings` from UI
   - Server applies defaults and merges via `resolveSettings()`.

4. **Provider/runtime options**
   - Provider order: `["Phala", "NovitaAI", "Z.ai"]`
   - Reasoning effort: `high`

5. **Context shaping / memory policy**
   - Message windowing to last 40 messages (`MAX_MESSAGES = 40`)

### Important behavioral note

Current continuity strategy is mostly:

- Large system prompt + editable Story State
- Last-40-message rolling window

There is no retrieval layer, memory ranking, or structured state fields in the runtime payload yet.

---

## B) Story-state summarization pipeline (`/api/summarize`)

### Current non-user inputs to the model

1. **System prompt + current Story State**
   - Server composes: ``${systemPrompt}\n\n## Current Story State\n${currentStoryState}``

2. **Summarizer control instruction (`SUMMARIZE_INSTRUCTION`)**
   - Appended as final synthetic user message by the server (not typed by player)
   - Enforces required output sections and anti-hallucination constraints
   - Current required sections:
     - Cast
     - Relationships
     - Appearance
     - Scene
     - Current Demeanor
     - Open Threads
     - Hard Facts

3. **Summarizer generation settings**
   - temperature: 0.4
   - maxOutputTokens: 1024
   - reasoning effort: `medium`
   - provider order: `["Phala", "NovitaAI", "Z.ai"]`

4. **Reliability behavior**
   - One automatic retry if summarizer returns empty text

### Review/acceptance gate

Summarizer output is proposed in UI and only becomes active Story State after user acceptance. This makes the accepted Story State itself a curated non-user context artifact.

---

## Source-of-Truth Files (Current)

- `src/lib/defaults.ts`
  - `DEFAULT_SYSTEM_PROMPT`
  - `DEFAULT_STORY_STATE`
  - `DEFAULT_SETTINGS`
- `src/app/page.tsx`
  - Sends `systemPrompt`, `storyState`, and `settings` to `/api/chat`
- `src/app/api/chat/route.ts`
  - Assembles and sends final chat request context to model
- `src/app/api/summarize/route.ts`
  - Defines summarizer instruction + summary request context
- `src/lib/hooks/use-summarization.ts`
  - Auto-trigger cadence + proposal/accept/reject flow
- `src/lib/hooks/use-field-setters.ts`
  - Imports/edits for system prompt and story state

---

## Planned Additions from `plan-npc-systems.md`

## 1) Dialogue examples for NPC voice grounding

Planned non-user context additions:

- A structured `Dialogue Examples` block loaded from companion prompt files
- Injected into model context with system-level character guidance
- Token-budgeted, inspectable, and removable in UI

Research value:

- Moves from descriptive persona text toward grounded style exemplars
- Enables testing example-based conditioning vs prose-only conditioning

## 2) Explicit rapport state tracking

Planned non-user context additions:

- `## Rapport` section in Story State
- Summarizer updates rapport score + rationale each cycle
- System prompt guidance to make behavior conditioned on rapport level

Research value:

- Converts latent social drift into explicit, inspectable state
- Supports longitudinal behavior analysis across turns/scenes

## 3) Appearance refresh policy

Planned non-user context additions:

- Appearance-refresh threshold as non-user config
- Runtime instruction/hint when appearance has not been referenced in N turns
- Continued summarizer ownership of canonical `## Appearance` updates

Research value:

- Introduces event/counter-based context injection
- Bridges static prompting with lightweight policy triggers

## 4) Auto-retry with provider rotation on empty responses

Planned non-user context additions:

- Retry attempt metadata controlling provider-order rotation
- User-visible retry status messaging
- Consistent provider-rotation resilience across chat and summarize paths

Research value:

- Separates generation policy reliability from content prompting
- Creates a robust transport/control plane around identical semantic context

---

## Current vs Planned: Non-User Context Matrix

| Context Component | Current | Planned |
| --- | --- | --- |
| System prompt persona/rules | Yes (large flat text) | Keep, add targeted guidance hooks |
| Story State block | Yes (single markdown block) | Add explicit Rapport and richer policy-driven sections |
| Dialogue exemplars | No | Yes (imported, token-capped examples) |
| Appearance reminder policy | No | Yes (turn-threshold based hinting) |
| Summarizer schema | Yes | Extend with Rapport scoring rules |
| Provider resilience control | Partial (fixed order + summarize retry once) | Full rotation on empty chat/summarize responses |
| Message-window memory policy | Yes (last 40 messages) | Keep, but complemented by richer state and policy blocks |

---

## Research Direction: Beyond Flat Prompt Tokens

This project is currently in a **flat-context regime**:

- monolithic system prompt
- monolithic story state markdown
- recency window

The plan introduces first steps toward a **layered context architecture**:

1. **Stable policy layer** (system rules)
2. **Dynamic world-state layer** (story state + rapport + appearance)
3. **Exemplar conditioning layer** (dialogue examples)
4. **Control-plane reliability layer** (provider retries/rotation)

This layered framing should make future experiments easier:

- schema-first state objects vs freeform markdown
- retrieval-augmented memory slices
- per-feature token budgets and ablation testing
- confidence/versioning for state updates

---

## Suggested Next Documentation Artifact

After implementing feature #2 (Rapport), add a second doc:

- `dev-docs/llm-state-schema.md`

with explicit JSON/TS schema options for Cast, Rapport, Appearance, Threads, and provenance metadata (which update wrote each field, and when).
