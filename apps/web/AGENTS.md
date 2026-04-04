# AGENTS.md — `apps/web`

## Purpose

Next.js 16 app runtime for Chatterbox. Hosts the chat UI, API routes, and client-side state management.

## Dependencies

- `@chatterbox/sockets` — boundary contract types and default implementations
- `@chatterbox/prompt-assembly` — segmented prompt assembler, segment definitions, turn tracker types, markdown parser, serialized segment types

## Key architecture

# AGENTS.md - `apps/web`

## Purpose

Next.js app runtime for Chatterbox. This package owns the chat UI, sidebar editors, API routes, and client-side orchestration.

## Dependencies

- `@chatterbox/sockets` for boundary contracts
- `@chatterbox/prompt-assembly` for segmented prompt parsing and assembly

## Current system summary

### Prompt assembly

- System prompts are managed as segments (`SerializedSegment[]`) and edited in `src/components/sidebar/system-prompt-editor.tsx`.
- User-imported prompt markdown is parsed with `parseSystemPromptToSegments()`.
- `useAssemblyTracker` updates per-segment inclusion state (`lastIncludedAt`) after turns.
- `liveConfig` sends `customSegments`, `lastIncludedAt`, `presentEntityIds`, and settings to `/api/chat`.
- `/api/chat` assembles the final prompt, appends hard player-control guardrails, and logs assembly behavior.
- `/api/chat` uses a larger context window budget for compression (`MAX_MESSAGES=60`, `VERBATIM_TIER_SIZE=20`, `SUMMARY_TIER_SIZE=20`) to improve 10-15 turn recall.
- `/api/chat` injects a compact depth-2 system note (when atmosphere/presence data exists) immediately before the last two model messages to reinforce scene grounding, present characters, and one-beat sensory pacing.
- `/api/chat` also performs pgvector RAG retrieval: user+assistant turn pairs are embedded in the background and top similar older turns are injected as a depth-4 system note when available.
- Digest-tier compression in `/api/chat` uses `src/lib/fact-extractor.ts` to extract structured facts from older turns, with legacy sentence summarization as fallback on extraction failure.
- Default assembly settings in `src/lib/defaults.ts` use `tokenBudget=4500` and `maxTokens=1500`.
- Prompt defaults enforce one conversational beat per turn and require sensory/body-language grounding in each response.

### Story state and pipeline

- Story state is entity-centric (`StructuredStoryState`) in `src/lib/story-state-model.ts` with stable entity IDs.
- Pipeline runs through `/api/state-update`: message windowing, LLM update, lifecycle validation, deterministic validation, auto-accept, and cascade resets.
- Presence scanning in `src/lib/presence-scanner.ts` updates `scene.presentEntityIds` for `on_presence` segment behavior.
- State history is persisted via `/api/conversations/[id]/state-history` and surfaced in sidebar history views.

### Conversation and persistence

- Conversation CRUD is DB-backed through `/api/conversations` and `/api/conversations/[id]`.
- `src/lib/storage.ts` initializes conversations with empty structured state and parsed default segments.
- `use-conversation-manager` handles hydration, switching, and auto-save.
- Keep `fieldsRef.current` pattern in `hydrateConversation` to avoid render-loop regressions.

### Truncate and rollback

- Message action `Delete all after` truncates client messages and triggers `/api/state-rollback`.
- Rollback returns corrected state plus cascade resets.
- Truncation re-aligns `lastPipelineTurn` with remaining user turns.
- Rollback also prunes `MessageEmbedding` rows for turns beyond the truncation boundary.

### UI behavior

- Desktop: chat + persistent sidebar. Mobile: full-screen overlay sidebar.
- Desktop configuration sidebar can be hidden and reopened from the header `Config` button; mobile uses the existing full-screen overlay trigger.
- iPhone Safari support relies on `h-dvh`, safe-area utilities in `globals.css`, and viewport fit in `layout.tsx`.
- Mobile message actions render below bubbles (not hover-only).
- Shared page chrome lives in `src/app/globals.css` as semantic classes such as `app-shell`, `app-panel-header`, `app-sidebar`, `app-message-surface*`, and `app-code-chip`. Reuse these before adding one-off wrapper utility strings for the same surface pattern.
- Sidebar editor primitives also live in `src/app/globals.css` as `app-editor-*` and `app-history-*` classes. Reuse them for section shells, editor headers, nested cards, small selects, warning notices, and history surfaces before adding new one-off chrome styles.
- Global color tokens in `src/app/globals.css` define the shared dark palette for page chrome, message surfaces, sidebar panels, and accent states. Prefer token/class reuse over hardcoded Tailwind color utilities in app UI.

### Model and routing notes

- `src/lib/model-registry.ts` defines allowed model IDs and provider ordering.
- Current registry includes `z-ai/glm-5`, `aion-labs/aion-2.0`, `google/gemini-3.1-pro-preview`, `qwen/qwen3.5-plus-02-15`, `deepseek/deepseek-v3.2`, `x-ai/grok-4.1-fast`, and `openai/gpt-oss-120b`.
- OpenRouter client config lives in `src/lib/openrouter.ts` (`extraBody.zdr = true`).
- `/api/chat` uses `stepCountIs(3)` to preserve multi-character tool-call headroom.
- `/api/chat` uses a two-phase draft flow when model is `aion-labs/aion-2.0` because that model does not support tool calls. Phase 1 runs GLM via `generateText` with full tool access to research context and produce a draft. Phase 2 streams Aion's final response with tool results and draft injected as system notes. The draft instruction tells GLM it is researching for another model; the Aion framing note establishes tool results as authoritative facts and the draft as structural guidance. See `src/app/api/chat/aion-draft.ts`.
- Message-pair embedding/retrieval lives in `src/lib/message-embeddings.ts` and uses `openai/text-embedding-3-small`.

## Key files

- `src/app/page.tsx` - chat shell, sidebar orchestration, `liveConfig`
- `src/app/api/chat/route.ts` - POST handler, prompt preparation, assembly context
- `src/app/api/chat/chat-tools.ts` - LLM tool definitions (get_character_details, get_story_context, etc.) and segment helpers
- `src/app/api/chat/history-compression.ts` - message windowing, scoring, tier assignment, summarization, digest fact extraction, RAG formatting
- `src/app/api/chat/depth-note.ts` - depth-2 scene grounding note builder
- `src/app/api/chat/aion-draft.ts` - Aion two-phase flow: GLM draft generation and Aion message assembly
- `src/app/api/chat/tool-bypass.ts` - message sanitization for plain-text-only providers
- `src/app/api/chat/system-prompt.ts` - system prompt construction, player control boundary, NPC guardrail
- `src/app/api/chat/stream-telemetry.ts` - tool call telemetry collection and stream callbacks
- `src/app/api/state-update/route.ts` - automatic state update pipeline
- `src/app/api/state-rollback/route.ts` - rollback after message truncation
- `src/lib/story-state-model.ts` - canonical state types, parser, serializer, reconciliation
- `src/lib/hooks/use-state-pipeline.ts` - client trigger and cascade reset integration
- `src/lib/hooks/use-conversation-manager.ts` - hydration, save lifecycle, switching
- `src/lib/state-pipeline/pipeline-socket.ts` - pipeline orchestration
- `src/components/sidebar/story-state-editor.tsx` - typed state editor container
- `src/components/sidebar/story-state-sections.tsx` - section-level state editors

## Guardrails and boundaries

- Import shared packages from root only: `@chatterbox/sockets`, `@chatterbox/prompt-assembly`.
- Do not deep-import package internals (`src/*`).
- Use `@/*` alias for app-internal imports.
- Runtime DB fallback in `src/lib/env.ts` points at host port `55432`; keep infra/docs in sync if that mapping changes.
- Preserve module-scope mutable `liveConfig` in `page.tsx`; do not refactor it into React state.

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm dev` starts successfully
- `src/components/sidebar/system-prompt-editor.tsx` — dual-mode: raw textarea when no segments exist, per-segment collapsible editor after import. Each segment card shows label, policy badge, token estimate, turns-since-included indicator, editable content, and optional omitted-summary text for skipped-turn context notes.
