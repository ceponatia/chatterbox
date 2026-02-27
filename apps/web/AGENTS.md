# AGENTS.md — `apps/web`

## Purpose

Next.js 16 app runtime for Chatterbox. Hosts the chat UI, API routes, and client-side state management.

## Dependencies

- `@chatterbox/sockets` — boundary contract types and default implementations
- `@chatterbox/prompt-assembly` — segmented prompt assembler, segment definitions, turn tracker types, markdown parser, serialized segment types

## Key architecture

### Prompt assembly flow

The monolithic `buildSystem()` has been replaced by the segmented prompt assembler:

1. **Import & parse**: When the user imports a `.md` system prompt file, `parseSystemPromptToSegments()` from `@chatterbox/prompt-assembly` parses it into `SerializedSegment[]`. The UI switches from a raw textarea to a per-segment collapsible editor showing content, policy badges, token estimates, and inclusion status.
2. **Client-side tracking**: `useAssemblyTracker` hook (`src/lib/hooks/use-assembly-tracker.ts`) runs the assembler after each user message to update `lastIncludedAt` (segment ID → last turn included). Accepts optional `customSegments` to use user-provided segments instead of defaults.
3. **Transport**: `liveConfig` sends `lastIncludedAt` and `customSegments` to the chat route alongside `systemPrompt`, `storyState`, and `settings`.
4. **Server-side**: `/api/chat/route.ts` creates an `AssemblyContext` from the request (including configurable `tokenBudget` from Settings). If `customSegments` are provided, creates a per-request assembler via `createAssemblerFromSerialized()`; otherwise uses the default assembler. The route appends a hard `Response Boundary (Critical)` guardrail to the final system prompt to forbid writing on behalf of the user/player and constrain generation to NPCs/environment. `logAssembly()` provides structured effectiveness logging.
5. **Persistence**: `lastIncludedAt` and `customSegments` are stored on the `Conversation` record in Postgres (via `/api/conversations/[id]`) and auto-saved by `useAutoSave`.

### State management

- `src/lib/defaults.ts` — Rules-only `DEFAULT_SYSTEM_PROMPT` template with `{{ char }}`/`{{ user }}` placeholders. Contains NEVER/ALWAYS rules, output format, setting/scope, voice/speech behavioral rules, and interaction guidelines. No character data — that lives in story state. `DEFAULT_STORY_STATE` is empty (new conversations use `emptyStructuredState()` directly).
- `src/lib/storage.ts` — `Conversation` data model with DB-backed CRUD (Postgres). `createConversation()` initializes with `emptyStructuredState()` and parses `DEFAULT_SYSTEM_PROMPT` into segments so both typed editors are immediately available. `migrateConversation()` detects old cast-based format (IM03) and re-parses from markdown to entity-based format (IM04). Active conversation ID is not persisted; app opens into a fresh conversation each load.
- `src/lib/story-state-model.ts` — Entity-centric `StructuredStoryState` types (see IM04). Characters are `Entity` objects with stable UUIDs. Sections reference entities by `entityId` instead of inline name strings. Two-pass parser: entity extraction → ID-resolved section parsing. Parser handles both legacy flat `## Appearance` format and new character-centric `## Characters` format (`### CharName` > `#### Appearance` > `- **key**: values`). Serializer emits the new `## Characters` grouped format. Key exports: `Entity`, `findOrCreateEntity()`, `findEntityByName()`, `resolveEntityName()`, `reconcileEntities()` (preserves UUIDs across pipeline updates).
- `src/lib/hooks/use-field-setters.ts` — React state for all conversation fields (including `customSegments`, `structuredState`). Story state handlers extracted to `useStoryStateHandlers()` sub-hook. `updateStoryStateFromSummary()` uses `reconcileEntities()` to preserve entity UUIDs when pipeline returns updated markdown. System prompt import triggers `parseSystemPromptToSegments()` and stores both parsed segments and assembled markdown. `handleStructuredStateUpdate()` syncs structured → markdown.
- `src/lib/hooks/use-conversation-manager.ts` — hydration, auto-save, auto-title, conversation switching. Hydrates and persists `structuredState`. `hydrateConversation` uses `fieldsRef.current` (stable ref) to avoid re-render loops — do not add `fields` to its dependency array.
- `src/lib/hooks/use-summarization.ts` — (legacy, unused) previously triggered `/api/summarize` for manual story state updates.
- `/api/summarize` — (legacy) manual story state update with truncation detection. No longer triggered from the UI; the state pipeline handles all updates.

### State pipeline

A single-pass hybrid pipeline that automatically updates story state after assistant responses:

1. **Message windowing** (deterministic) — only recent messages are sent to the LLM (since `lastPipelineTurn` + 10 overlap messages for context). First run caps at 40 messages. Client sends `lastPipelineTurn` in the request body so the server can window.
2. **Single-pass LLM call** — one call reads the windowed conversation + current state and outputs JSON with both `updatedState` (complete markdown) and `changes` (structured fact list with type, detail, sourceTurn, confidence). The LLM reviews EVERY section against what's happening in the conversation: updating scene/demeanor to match NOW, removing superseded hard facts, resolving threads, updating relationships, etc.
3. **Validation** (deterministic) — schema, novelty, completeness checks, diff percentage.
4. **Auto-accept** (deterministic) — disposition scoring: auto_accepted / flagged / retried. Retried triggers one retry, then falls back to flagged.
5. **Cascade triggers** — fact types (e.g. `scene_change`, `hard_fact_superseded`) reset `lastIncludedAt` for related segments so they re-inject next turn.

Key files:

- `src/app/api/state-update/route.ts` — server-side pipeline endpoint (single-pass hybrid)
- `src/lib/state-pipeline/cascade-triggers.ts` — fact type → segment reset mapping
- `src/lib/state-pipeline/validation.ts` — deterministic validation checks
- `src/lib/state-pipeline/auto-accept.ts` — disposition logic
- `src/lib/state-history.ts` — `StateHistoryEntry` type + API persistence (`/api/conversations/[id]/state-history`)
- `src/lib/hooks/use-state-pipeline.ts` — fire-and-forget client trigger, sends `lastPipelineTurn` for windowing, applies cascade resets via `onCascadeResets` callback. History append errors are caught so they don't block state updates.

Dead code (kept for reference, no longer imported):

- `src/lib/state-pipeline/fact-processing.ts` — was: confidence filter + deduplication (superseded by single-pass)
- `src/lib/state-pipeline/section-merge.ts` — was: per-section merge instructions and prompt builder (superseded by single-pass)
- `src/components/sidebar/story-state-review.tsx` — legacy manual review UI
- `src/components/sidebar/diff-view.tsx` — legacy review diff renderer
- `src/components/sidebar/review-actions.tsx` — legacy review action controls
- `src/components/chat/summarize-review-dialog.tsx` — legacy summarize review modal wrapper

The pipeline runs on the same interval as auto-summarize. Updates are applied silently and recorded in state history. The manual "Update State" button in the chat header triggers the pipeline on demand.

### State updates (always auto-accepted)

All state updates from the pipeline are applied silently. There is no review mode or manual approval step. A green pulsing dot appears on the Story State tab for ~3s after each update. State change history is available in the State History section of the Story State tab.

Key files:

- `src/components/sidebar/state-history.tsx` — scrollable history of all state changes with expandable inline details (validation badges, extracted facts). Clicking an entry row opens a detail modal.
- `src/components/sidebar/state-history-detail.tsx` — full-screen modal for a state history entry showing validation badges, extracted facts with type/confidence, and a line-level diff between previous and new state.
- `src/components/sidebar/story-state-editor.tsx` — Orchestrator for story state UI: header, import/reset, and `StructuredEditorBody` which renders all typed sections. All sections are always visible with Add buttons (no empty-state hiding).
- `src/components/sidebar/story-state-sections.tsx` — Extracted typed section editors: `EntitiesSection`, `RelationshipsSection`, `CharactersSection`, `SceneSection`, `DemeanorSection`, `BulletListSection`, `CustomSectionEditor`. Character name fields use `EntitySelect` combobox with autocomplete from entity registry. Typing an unknown name auto-creates a new entity on blur. `CharactersSection` groups entries by entity with collapsible sub-containers and an "Appearance" sub-heading; each attribute row auto-detects tag-style (comma-separated, no periods) vs prose and renders an appropriate input. Shows state history and "recently updated" indicator.
- `src/lib/hooks/use-sync-status.ts` — `useSyncStatus` hook tracking save lifecycle for Story State and System Prompt. Three states: `saved` (green dot), `pending` (yellow dot — edit made, waiting for 500ms debounce save), `error` (red dot — conversion failure). Wired through `useAutoSave` in conversation manager. `SyncDot` component in `page.tsx` renders the colored indicator in each tab.
- `src/components/sidebar/system-prompt-editor.tsx` — dual-mode: raw textarea when no segments exist, per-segment collapsible editor after import. Each segment card shows label, policy badge, token estimate, turns-since-included indicator, and editable content.
- `src/lib/hooks/use-state-history.ts` — `useStateHistoryEntries` hook using async API fetch to read DB-backed state history
- `src/lib/hooks/use-state-pipeline.ts` — returns `historyVersion` counter and `recentlyUpdated` flag

### Mobile UI (iPhone Safari)

The layout is responsive with two distinct modes:

- **Desktop (`lg+`)**: Side-by-side — chat left, persistent sidebar right (`w-125`)
- **Mobile (`< lg`)**: Full-screen swap — chat view is default, tapping the config button (sliders icon) replaces the entire screen with the sidebar. An arrow-left button returns to chat. Title "RP Sketcher" and model subtext are hidden on mobile to prevent header overflow.

Key files:

- `src/lib/hooks/use-mobile-sidebar.ts` — `useMobileSidebar()` hook managing `open` state with `toggle`/`close` callbacks
- `MobileSidebarOverlay` component in `page.tsx` — fixed full-screen overlay (`z-50`, `lg:hidden`) with safe-area padding
- `ChatHeader` — responsive: icon-only buttons on mobile, text+icon on desktop. Config button (`SlidersHorizontal`) visible only on mobile (`lg:hidden`).

iOS Safari support:

- `layout.tsx` exports `viewport` with `viewportFit: "cover"` for safe-area support
- `globals.css` provides `safe-top`, `safe-bottom`, `safe-x`, `safe-y` utility classes using `env(safe-area-inset-*)`
- `ChatInput` uses `safe-bottom` for home indicator clearance
- Outer container uses `h-dvh` (dynamic viewport height) instead of `h-screen` to prevent overflow when the iOS address bar is visible

Chat controls on mobile:

- Message edit/regenerate/delete actions are rendered below each bubble on `lg`-and-down to avoid hover-only affordances.

### Topic embeddings

`src/lib/topic-embeddings.ts` computes cosine similarity between the user message and each `on_topic` segment's topic description using `text-embedding-3-small` via OpenRouter. Segment embeddings are cached in-memory. Scores are passed to the assembler via `AssemblyContext.topicScores` as a semantic fallback when keyword matching misses (threshold 0.5). Fails gracefully — returns empty scores on error.

### Model selection

- `src/lib/model-registry.ts` defines the curated model list, display labels, and provider priority order per model.
- `Settings.model` stores the selected OpenRouter model ID (default `z-ai/glm-5`) and is persisted in conversation settings JSON.
- `page.tsx` sends selected settings through `liveConfig` to `/api/chat` and into `useStatePipeline` for `/api/state-update`.
- OpenRouter client setup is centralized in `src/lib/openrouter.ts` with `extraBody.zdr = true` for all outbound OpenRouter requests.
- `/api/chat`, `/api/state-update` (via `pipeline-socket.ts`), and legacy `/api/summarize` resolve provider order from `model-registry` and call `openrouter(modelId)` dynamically.

### API routes

- `/api/chat` — streaming chat via OpenRouter, uses segmented prompt assembler with semantic topic scores. Accepts optional `customSegments` from client to override default segments. Appends a final hard guardrail reminding the model to never write for the user/player.
- `/api/chat` — also appends a runtime **Player Control Boundary** that binds `{{ user }}` to the second member of the story state's `## Cast` list (canonical single player character). If this identity cannot be resolved, instructions force ambiguity-safe NPC/environment-only narration with clarification instead of writing for the player.
- `/api/summarize` — (legacy) manual story state update with truncation detection, retry escalation, and structural completeness checks. No longer triggered from the UI.
- `/api/state-update` — single-pass hybrid state pipeline (one LLM call → updated state + fact list → validate → auto-accept → cascade resets). Message windowing via `lastPipelineTurn`.
- `/api/conversations` — list conversation metadata from Postgres
- `/api/conversations/[id]` — fetch/upsert/delete a conversation record in Postgres
- `/api/conversations/[id]/state-history` — fetch/append/delete per-conversation state history entries

## Import rules

- Import from `@chatterbox/sockets` and `@chatterbox/prompt-assembly` via package root only
- Use `@/*` path alias for app-internal imports
- Never deep-import package internals (`src/*`)

## Validation

Before merging changes:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm dev` starts successfully

## Infra commands

- `pnpm infra:up` starts Postgres via Docker Compose.
- `pnpm infra:down` stops Postgres via Docker Compose.
