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
5. **Persistence**: `lastIncludedAt` and `customSegments` are stored on the `Conversation` object in localStorage and auto-saved by `useAutoSave`.

### State management

- `src/lib/defaults.ts` — Story-agnostic `DEFAULT_SYSTEM_PROMPT` template with `{{ char }}`/`{{ user }}` placeholders and `[customize]` markers. `DEFAULT_STORY_STATE` is empty (new conversations use `emptyStructuredState()` directly).
- `src/lib/storage.ts` — `Conversation` data model with localStorage CRUD. `createConversation()` initializes with `emptyStructuredState()` and parses `DEFAULT_SYSTEM_PROMPT` into segments so both typed editors are immediately available. `migrateConversation()` detects old cast-based format (IM03) and re-parses from markdown to entity-based format (IM04). `safeStorage` falls back to in-memory storage when localStorage is blocked (e.g., iOS Safari private mode or HTTP), so the conversation list still updates in-session.
- `src/lib/story-state-model.ts` — Entity-centric `StructuredStoryState` types (see IM04). Characters are `Entity` objects with stable UUIDs. Sections reference entities by `entityId` instead of inline name strings. Two-pass parser: entity extraction → ID-resolved section parsing. Serializer resolves entity IDs → names at markdown generation time. Key exports: `Entity`, `findOrCreateEntity()`, `findEntityByName()`, `resolveEntityName()`, `reconcileEntities()` (preserves UUIDs across pipeline updates).
- `src/lib/hooks/use-field-setters.ts` — React state for all conversation fields (including `customSegments`, `structuredState`). Story state handlers extracted to `useStoryStateHandlers()` sub-hook. `updateStoryStateFromSummary()` uses `reconcileEntities()` to preserve entity UUIDs when pipeline returns updated markdown. System prompt import triggers `parseSystemPromptToSegments()` and stores both parsed segments and assembled markdown. `handleStructuredStateUpdate()` syncs structured → markdown.
- `src/lib/hooks/use-conversation-manager.ts` — hydration, auto-save, auto-title, conversation switching. Hydrates and persists `structuredState`.
- `src/lib/hooks/use-summarization.ts` — triggers `/api/summarize` for manual story state updates

### State pipeline

A multi-stage background pipeline that automatically updates story state after assistant responses:

1. **Fact extraction** (LLM) — extracts structured facts from recent messages with source-turn attribution and confidence scores
2. **Fact processing** (deterministic) — confidence filtering (threshold 0.6) + deduplication against current state
3. **State merge** (LLM) — per-section specialized merge with section-specific instructions (Scene, Appearance, Demeanor, Relationships, Cast, Open Threads, Hard Facts)
4. **Validation** (deterministic) — schema, hard fact preservation, novelty, completeness checks
5. **Auto-accept** (deterministic) — disposition scoring: auto_accepted / flagged / retried
6. **Cascade triggers** — fact types (e.g. `scene_change`) reset `lastIncludedAt` for related segments so they re-inject next turn

Key files:
- `src/app/api/state-update/route.ts` — server-side pipeline endpoint
- `src/lib/state-pipeline/fact-processing.ts` — confidence filter + deduplication
- `src/lib/state-pipeline/cascade-triggers.ts` — fact type → segment reset mapping
- `src/lib/state-pipeline/section-merge.ts` — per-section merge instructions and prompt builder
- `src/lib/state-pipeline/validation.ts` — deterministic validation checks
- `src/lib/state-pipeline/auto-accept.ts` — disposition logic
- `src/lib/state-history.ts` — `StateHistoryEntry` type + localStorage persistence
- `src/lib/hooks/use-state-pipeline.ts` — fire-and-forget client trigger, applies cascade resets via `onCascadeResets` callback

The pipeline runs on the same interval as auto-summarize. Updates are applied silently and recorded in state history.

### UI: Production/Review mode (Phase 3)

The `Settings.reviewMode` boolean controls how state updates are surfaced:

- **Production mode** (`reviewMode: false`, default): State updates from the pipeline are applied silently. The `StoryStateReview` component is hidden. A green pulsing dot appears on the Story State tab and editor header for ~3s after each update.
- **Review mode** (`reviewMode: true`): The existing `StoryStateReview` component is shown inline when summarization completes, requiring manual accept/reject.

Key files:
- `src/components/sidebar/state-history.tsx` — scrollable history of all state changes with expandable details (validation badges, extracted facts)
- `src/components/sidebar/settings-panel.tsx` — production/review mode toggle button
- `src/components/sidebar/story-state-editor.tsx` — Orchestrator for story state UI: header, import/reset, review mode, and `StructuredEditorBody` which renders all typed sections. All sections are always visible with Add buttons (no empty-state hiding).
- `src/components/sidebar/story-state-sections.tsx` — Extracted typed section editors: `EntitiesSection`, `RelationshipsSection`, `AppearanceSection`, `SceneSection`, `DemeanorSection`, `BulletListSection`, `CustomSectionEditor`. Character name fields use `EntitySelect` combobox with autocomplete from entity registry. Typing an unknown name auto-creates a new entity on blur. Shows state history and "recently updated" indicator.
- `src/lib/hooks/use-sync-status.ts` — `useSyncStatus` hook tracking save lifecycle for Story State and System Prompt. Three states: `saved` (green dot), `pending` (yellow dot — edit made, waiting for 500ms debounce save), `error` (red dot — conversion failure). Wired through `useAutoSave` in conversation manager. `SyncDot` component in `page.tsx` renders the colored indicator in each tab.
- `src/components/sidebar/system-prompt-editor.tsx` — dual-mode: raw textarea when no segments exist, per-segment collapsible editor after import. Each segment card shows label, policy badge, token estimate, turns-since-included indicator, and editable content.
- `src/lib/hooks/use-state-history.ts` — `useStateHistoryEntries` hook using `useSyncExternalStore` to read localStorage
- `src/lib/hooks/use-state-pipeline.ts` — returns `historyVersion` counter and `recentlyUpdated` flag

### Mobile UI (iPhone Safari)

The layout is responsive with two distinct modes:

- **Desktop (`lg+`)**: Side-by-side — chat left, persistent sidebar right (`w-125`)
- **Mobile (`< lg`)**: Full-screen swap — chat view is default, tapping the config button (sliders icon) replaces the entire screen with the sidebar. An arrow-left button returns to chat.

Key files:
- `src/lib/hooks/use-mobile-sidebar.ts` — `useMobileSidebar()` hook managing `open` state with `toggle`/`close` callbacks
- `MobileSidebarOverlay` component in `page.tsx` — fixed full-screen overlay (`z-50`, `lg:hidden`) with safe-area padding
- `ChatHeader` — responsive: icon-only buttons on mobile, text+icon on desktop. Config button (`SlidersHorizontal`) visible only on mobile (`lg:hidden`).

iOS Safari support:
- `layout.tsx` exports `viewport` with `viewportFit: "cover"` for safe-area support
- `globals.css` provides `safe-top`, `safe-bottom`, `safe-x`, `safe-y` utility classes using `env(safe-area-inset-*)`
- `ChatInput` uses `safe-bottom` for home indicator clearance

Chat controls on mobile:
- Message edit/regenerate/delete actions are rendered below each bubble on `lg`-and-down to avoid hover-only affordances.

### Topic embeddings

`src/lib/topic-embeddings.ts` computes cosine similarity between the user message and each `on_topic` segment's topic description using `text-embedding-3-small` via OpenRouter. Segment embeddings are cached in-memory. Scores are passed to the assembler via `AssemblyContext.topicScores` as a semantic fallback when keyword matching misses (threshold 0.5). Fails gracefully — returns empty scores on error.

### API routes

- `/api/chat` — streaming chat via OpenRouter, uses segmented prompt assembler with semantic topic scores. Accepts optional `customSegments` from client to override default segments. Appends a final hard guardrail reminding the model to never write for the user/player.
- `/api/summarize` — manual story state update with truncation detection, retry escalation, and structural completeness checks
- `/api/state-update` — multi-stage state pipeline (extract → filter/dedup → section merge → validate → auto-accept → cascade resets)
- `/api/conversations` — list conversation metadata for DB-backed storage when local storage is disabled
- `/api/conversations/[id]` — fetch/upsert/delete a conversation record for DB-backed storage

## Import rules

- Import from `@chatterbox/sockets` and `@chatterbox/prompt-assembly` via package root only
- Use `@/*` path alias for app-internal imports
- Never deep-import package internals (`src/*`)

## Validation

Before merging changes:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm dev` starts successfully

## Local storage toggle

- `pnpm infra:up` writes `LOCAL_STORAGE_DISABLED=true` and `NEXT_PUBLIC_LOCAL_STORAGE_DISABLED=true` into `apps/web/.env`.
- `pnpm infra:down` removes both flags from `apps/web/.env`.
