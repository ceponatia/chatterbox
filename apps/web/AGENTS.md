# AGENTS.md — `apps/web`

## Purpose

Next.js 16 app runtime for Chatterbox. Hosts the chat UI, API routes, and client-side state management.

## Dependencies

- `@chatterbox/sockets` — boundary contract types and default implementations
- `@chatterbox/prompt-assembly` — segmented prompt assembler, segment definitions, turn tracker types

## Key architecture

### Prompt assembly flow

The monolithic `buildSystem()` has been replaced by the segmented prompt assembler:

1. **Client-side**: `useAssemblyTracker` hook (`src/lib/hooks/use-assembly-tracker.ts`) runs the assembler after each user message to update `lastIncludedAt` (segment ID → last turn included). This is persisted per-conversation in localStorage.
2. **Transport**: `liveConfig` sends `lastIncludedAt` to the chat route alongside `systemPrompt`, `storyState`, and `settings`.
3. **Server-side**: `/api/chat/route.ts` creates an `AssemblyContext` from the request (including configurable `tokenBudget` from Settings), runs the assembler, and appends story state separately. `logAssembly()` provides structured effectiveness logging: turn number, included/omitted counts, token usage %, and omit reason breakdown.
4. **Persistence**: `lastIncludedAt` is stored on the `Conversation` object in localStorage and auto-saved by `useAutoSave`.

### State management

- `src/lib/storage.ts` — `Conversation` data model with localStorage CRUD
- `src/lib/hooks/use-field-setters.ts` — React state for all conversation fields
- `src/lib/hooks/use-conversation-manager.ts` — hydration, auto-save, auto-title, conversation switching
- `src/lib/hooks/use-summarization.ts` — triggers `/api/summarize` for manual story state updates

### State pipeline (Phase 2)

A multi-stage background pipeline that automatically updates story state after assistant responses:

1. **Fact extraction** (LLM) — extracts structured facts from recent messages with source-turn attribution
2. **State merge** (LLM) — patches existing state with extracted facts (constrained input, not full conversation)
3. **Validation** (deterministic) — schema, hard fact preservation, novelty, completeness checks
4. **Auto-accept** (deterministic) — disposition scoring: auto_accepted / flagged / retried

Key files:
- `src/app/api/state-update/route.ts` — server-side pipeline endpoint
- `src/lib/state-pipeline/validation.ts` — deterministic validation checks
- `src/lib/state-pipeline/auto-accept.ts` — disposition logic
- `src/lib/state-history.ts` — `StateHistoryEntry` type + localStorage persistence
- `src/lib/hooks/use-state-pipeline.ts` — fire-and-forget client trigger after assistant responses

The pipeline runs on the same interval as auto-summarize. Updates are applied silently and recorded in state history.

### UI: Production/Review mode (Phase 3)

The `Settings.reviewMode` boolean controls how state updates are surfaced:

- **Production mode** (`reviewMode: false`, default): State updates from the pipeline are applied silently. The `StoryStateReview` component is hidden. A green pulsing dot appears on the Story State tab and editor header for ~3s after each update.
- **Review mode** (`reviewMode: true`): The existing `StoryStateReview` component is shown inline when summarization completes, requiring manual accept/reject.

Key files:
- `src/components/sidebar/state-history.tsx` — scrollable history of all state changes with expandable details (validation badges, extracted facts)
- `src/components/sidebar/settings-panel.tsx` — production/review mode toggle button
- `src/components/sidebar/story-state-editor.tsx` — conditionally renders review section, shows state history and "recently updated" indicator
- `src/lib/hooks/use-state-history.ts` — `useStateHistoryEntries` hook using `useSyncExternalStore` to read localStorage
- `src/lib/hooks/use-state-pipeline.ts` — returns `historyVersion` counter and `recentlyUpdated` flag

### API routes

- `/api/chat` — streaming chat via OpenRouter, uses segmented prompt assembler
- `/api/summarize` — manual story state update with truncation detection, retry escalation, and structural completeness checks
- `/api/state-update` — multi-stage state pipeline (fact extraction → merge → validate → auto-accept)

## Import rules

- Import from `@chatterbox/sockets` and `@chatterbox/prompt-assembly` via package root only
- Use `@/*` path alias for app-internal imports
- Never deep-import package internals (`src/*`)

## Validation

Before merging changes:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm dev` starts successfully
