# AGENTS.md - `apps/web`

## Purpose

Next.js app runtime for Chatterbox. This package owns the chat UI, sidebar editors, API routes, and client-side orchestration.

## Dependencies

- `@chatterbox/sockets` for boundary contracts
- `@chatterbox/prompt-assembly` for segmented prompt parsing and assembly
- `@chatterbox/state-model` for entity-centric story state types, parser, serializer, entity operations, lifecycle reconciliation, and presence scanning

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
- `/api/chat` primarily assembles from `customSegments`, but must fall back to parsing the saved raw `systemPrompt` when older conversations are missing segment JSON.
- Default assembly settings in `src/lib/defaults.ts` use `tokenBudget=5000` and `maxTokens=1500`.
- Prompt defaults enforce one conversational beat per turn and require sensory/body-language grounding in each response.

### Story state and pipeline

- Story state is entity-centric (`StructuredStoryState`) defined in `@chatterbox/state-model` with stable entity IDs. All types, parsing, serialization, entity operations, lifecycle reconciliation, presence scanning, and effective state resolution live in the package.
- Pipeline runs through `/api/state-update`: message windowing, LLM update, lifecycle validation, deterministic validation, auto-accept, and cascade resets.
- `/api/state-update` accepts an optional `sinceMessageId` parameter to window messages for incremental (fast-lane) refresh.
- Presence scanning via `@chatterbox/state-model` updates `scene.presentEntityIds` for `on_presence` segment behavior.
- State history is persisted via `/api/conversations/[id]/state-history` and surfaced in sidebar history views.
- Live state refresh: `use-state-refresh` polls `/api/conversations/[id]/refresh-check` every 45 seconds while the tab is visible. When eligible, it triggers a fast-lane pipeline run and marks the checkpoint. Lease-based coordination prevents duplicate refreshes across tabs.
- Candidate facts (`CandidateFact[]`) are staged in `Conversation.candidateFacts` (JSON field) and reconciled by `src/app/api/conversations/[id]/slow-lane/route.ts` on the slower background cadence.

### Conversation and persistence

- Conversation CRUD is DB-backed through `/api/conversations` and `/api/conversations/[id]`.
- Settings preset CRUD is DB-backed through `/api/presets` and `/api/presets/[id]`, scoped to the authenticated user and supporting a single transactional default preset.
- Conversations may optionally link back to a reusable story definition via nullable `storyProjectId`; unlinked conversations must keep legacy behavior.
- `ConversationMeta` includes `storyProjectId` and `storyProjectName` (derived via Prisma join to `StoryProject.name`, not stored as a column).
- The chat header shows a clickable provenance badge (BookOpen icon + story name) linking to `/stories/{id}` when `storyProjectId` is present.
- The conversation list/drawer shows the source story name under the conversation title.
- A "Fork to Story" action in the chat header creates a new story project from the current conversation's system prompt and story state via the existing create+import API flow.
- `src/lib/storage.ts` initializes conversations with empty structured state and parsed default segments.
- `src/lib/storage.ts` also reconstructs missing `customSegments` and `structuredState` from saved markdown when loading legacy conversations, then normalizes lifecycle defaults.
- `src/lib/storage.ts` exposes `createConversationDraftAsync()` which fetches the user's default settings preset before creating a new conversation; falls back to `DEFAULT_SETTINGS` on failure.
- `use-conversation-manager` handles hydration, switching, and auto-save.
- Keep `fieldsRef.current` pattern in `hydrateConversation` to avoid render-loop regressions.

### Story projects and authoring

- Reusable story authoring lives on route-backed screens at `/stories` and `/stories/[id]`; do not fold story authoring into the chat sidebar model.
- Character editing also uses a route-backed builder at `/stories/[id]/characters/[charId]`; keep detailed character editing there instead of reintroducing inline editing in the story editor.
- Story authoring data stays app-local in `src/lib/story-project-types.ts` and is exposed through the `/api/story-projects` route family.
- `src/lib/story-project-types.ts` also defines `StoryLocationRecord`, `LocationConnectionRecord`, `StoryLocationInput`, and `LocationConnectionInput` for route-backed location editing.
- Phase 1 is import-first: story projects preserve imported system prompt markdown, imported story state markdown, and per-character imported markdown while regenerating cached runtime artifacts on save/import/manual generate.
- Character records also support structured fields plus per-section provenance. The parse route for imported character markdown must be additive and must not clear sections that were not successfully parsed.
- Character records include `sensoryProfile` (JSON) for storing inferred/manual sensory data (scent, texture, taste). The `SensoryProfile` type, empty factory, and validator live in `src/lib/sensory-schema.ts`.
- Character builder layout is schema-driven from `src/lib/character-schema.ts`; builder UI should reuse that metadata rather than hardcoding a second field map.
- Character builder field types include `dialogue-examples` for dynamic lists of `DialogueExample` objects with tag selectors; `DIALOGUE_EXAMPLE_TAGS` in `character-schema.ts` defines the predefined tag set.
- `src/lib/story-project-core.ts` is the shared helper path for import/generation/export/launch; routes should stay thin and reuse it instead of reimplementing prompt/state generation logic.
- `src/lib/story-project-core.ts` generates a dynamic `location_context` prompt segment (policy `always`, priority `high`) when the story has authored locations. The segment is upserted alongside character behavior segments during artifact generation. Stories without locations produce no location segment.
- `src/lib/character-derivation.ts` derives entities, appearance, demeanor, and on-presence behavior segments from structured character fields. `src/lib/story-project-core.ts` should prefer these structured derivations and fall back to `importedMarkdown` only when structured behavior data is absent.
- Character records support optional `dialogueExamples: DialogueExample[]` -- an array of `{ text, tag }` objects with predefined tags. `deriveBehaviorSegment` in `character-derivation.ts` appends tagged dialogue examples to the character behavior segment when present.
- Launching a story project creates a new conversation snapshot from generated artifacts and persists `storyProjectId` on that conversation.
- Story project launch (`/api/story-projects/[id]/launch`) applies the user's default settings preset if one exists; otherwise falls back to `DEFAULT_SETTINGS`.
- Import supports `replace` (default) and `merge` modes via `StoryProjectImportInput.mode`. Replace overwrites imported data; merge appends new entities/facts/threads and concatenates prompts without removing existing content.
- The story editor overview tab includes a file-upload import card that triggers an `ImportReviewModal` before executing the import API call. The modal previews parsed segments and state sections and lets the user choose Replace or Merge.
- The segment inspector shows provenance badges (`imported`, `form`, `override`) on each segment row based on whether a blueprint, imported prompt, or segment override is the source.
- The preview/export tab offers per-file markdown download buttons for system prompt, story state, and individual character markdown files.

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
- Story project character lists use summary cards that link into the dedicated builder route; keep create/delete actions in the list, and keep field-by-field editing inside the builder screen.
- The inactive story-state review experiment was removed. `src/lib/diff.ts` now exists only for line-diff rendering used by state history surfaces, not as a second approval UI path.
- Shared page chrome lives in `src/app/globals.css` as semantic classes such as `app-shell`, `app-panel-header`, `app-sidebar`, `app-message-surface*`, and `app-code-chip`. Reuse these before adding one-off wrapper utility strings for the same surface pattern.
- Sidebar editor primitives also live in `src/app/globals.css` as `app-editor-*` and `app-history-*` classes. Reuse them for section shells, editor headers, nested cards, small selects, warning notices, and history surfaces before adding new one-off chrome styles.
- Global color tokens in `src/app/globals.css` define the shared dark palette for page chrome, message surfaces, sidebar panels, and accent states. Prefer token/class reuse over hardcoded Tailwind color utilities in app UI.

### Model and routing notes

- `src/lib/model-registry.ts` defines allowed model IDs and provider ordering.
- Current registry includes `z-ai/glm-5`, `z-ai/glm-5.1`, `z-ai/glm-5-turbo`, `google/gemini-3.1-pro-preview`, `qwen/qwen3.5-plus-02-15`, `deepseek/deepseek-v3.2`, `x-ai/grok-4.1-fast`, and `openai/gpt-oss-120b`.
- OpenRouter client config lives in `src/lib/openrouter.ts` (`extraBody.zdr = true`).
- `SENSORY_INFERENCE_MODEL` env var controls the model for sensory inference (defaults to `z-ai/glm-5`).
- Story authoring routes follow the flat `/api/story-projects` family: root CRUD, nested character CRUD, `relationships`, and the explicit `import`, `generate`, `export`, and `launch` action routes.
- `/api/story-projects/[id]/locations` -- CRUD for story project locations (GET list, POST create)
- `/api/story-projects/[id]/locations/[locationId]` -- single location (GET, PUT, DELETE)
- `/api/story-projects/[id]/locations/[locationId]/connections` -- batch connection update (GET, PUT)
- `/api/chat` exposes 11 tools (plus 3 conditional location tools and 1 conditional `note_to_self` tool) via `createChatTools()`, split across `chat-tools.ts` (core tools), `chat-tools-extended.ts` (facts, relationships, threads, scene, entity, history, location tools), and `chat-tools-notes.ts` (working memory). Tool step count is dynamically capped: base 3, +1 when 3 or more entities are present, +1 when location tools are available, with a maximum of 6. A forced first tool call is still applied when keyword detection routes to a specific tool. Tool guidance in the system prompt is generated dynamically by `buildToolsInstruction()` based on registered tool names. `get_character_details` defaults to `fullDetail: true`, and the "Already in context" manifest distinguishes prompt-included segments from tool-retrievable data that should still be fetched when the turn procedure requires it.
- `/api/chat/stream-telemetry.ts` logs every detected tool invocation through `tool-call-logger.ts`, including tool name, conversation ID, and a truncated argument summary for dev instrumentation.
- When `structured.locations.length > 0`, three additional tools are registered: `get_location_details` (canonical location lookup with connections and entities present), `get_nearby_locations` (adjacency list from current position), and `move_to_location` (validate connectivity, update scene, rebuild presence). `move_to_location` mutates the parsed `StructuredStoryState` in place so post-response persistence captures the state change.
- `get_scene_context` returns `locationId` and `connections` when the scene has a structured location set; otherwise these fields are `null`/empty (backward compatible).
- `note_to_self` tool (`chat-tools-notes.ts`) persists working memory notes to `ConversationNote` table (cap 20, prunes oldest). Recent notes (last 10) are injected as a system message each turn via `getRecentNotes()`. The tool is registered when `conversationId` is present. System messages are built after tools are finalized so guidance reflects all available tools.
- `get_backstory` supports optional `section` (string) and `keywords` (string[]) parameters for structured backstory retrieval. When provided, the tool queries `BackstorySection` rows (pgvector, raw SQL) parsed from the character's background field. Section lookup uses case-insensitive name matching (exact > prefix > substring). Keyword lookup embeds the keywords and performs cosine similarity search (threshold 0.3). When no match is found, available section names are returned. Falls back to segment text when no structured sections exist.
- Backstory indexing: `src/lib/backstory-parser.ts` parses `StoryCharacter.background` by `###` headings into named sections, embeds each via `text-embedding-3-small`, and stores in the `BackstorySection` table. Indexing fires eagerly (fire-and-forget) on character create/update when the background field is present.
- Message-pair embedding/retrieval lives in `src/lib/message-embeddings.ts` and uses `openai/text-embedding-3-small`.

## Key files

- `src/app/page.tsx` - chat shell, sidebar orchestration, `liveConfig`
- `src/app/stories/page.tsx` - story library route
- `src/app/stories/[id]/page.tsx` - story project editor route
- `src/app/stories/[id]/characters/[charId]/page.tsx` - route-backed character builder entry
- `src/middleware.ts` - request middleware for auth gating and user ID header injection
- `src/app/api/auth/login/route.ts` - login endpoint (password verify, session cookie)
- `src/app/api/auth/register/route.ts` - registration endpoint (user creation, preset seeding, session cookie)
- `src/app/login/page.tsx` - login/register page with toggle between sign-in and registration modes
- `src/components/auth/auth-form.tsx` - client auth form used by the login route; keeps the route file thin while preserving the combined sign-in/registration flow
- `src/app/api/story-projects/**` - story project CRUD/action routes
- `src/components/story/import-review-modal.tsx` - import review/preview dialog with merge/replace actions
- `src/components/story/story-editor-client.tsx` - story editor shell with 6-tab layout and import modal wiring
- `src/components/story/story-editor-client-sections.tsx` - editor cards, import card, per-file export buttons
- `src/components/story/segment-inspector.tsx` - segment list with provenance badges
- `src/components/story/character-builder-client.tsx` - character builder shell for mobile/desktop layouts
- `src/components/story/character-builder-tabs.tsx` - tab content for identity, appearance, behavior, demeanor, and source sections
- `src/components/story/character-form-field.tsx` - shared schema-driven field renderer for character builder controls
- `src/components/story/sensory-editor.tsx` - Sensory tab component with inference button, lock toggles, and preview overlay
- `src/components/story/character-source-tab.tsx` - provenance display and parse-from-import action for character source tab
- `src/components/story/use-character-builder.ts` - builder data loading, dirty tracking, save flow, and import parse
- `src/lib/character-schema.ts` - character builder tab/section/field definitions and structured defaults
- `src/lib/character-markdown-parser.ts` - parses character template markdown into structured fields (identity, appearance, behavioral profile, etc.)
- `src/lib/character-derivation.ts` - derives runtime artifacts (entities, appearance, demeanor, on_presence segments) from structured character data
- `src/lib/sensory-schema.ts` - SensoryProfile types, emptySensoryProfile factory, validateSensoryProfile guard
- `src/app/api/chat/route.ts` - POST handler, prompt preparation, assembly context
- `src/app/api/chat/chat-tools.ts` - Core LLM tool definitions, shared helpers (compactText, buildStoryContext\*), and createChatTools factory
- `src/app/api/chat/chat-tools-extended.ts` - Extended tool definitions (get_facts, get_relationships, get_threads, get_scene_context, lookup_entity, search_history, get_location_details, get_nearby_locations, move_to_location)
- `src/app/api/chat/chat-tools-notes.ts` - Working memory tool (note_to_self) and note injection helper (getRecentNotes)
- `src/lib/backstory-parser.ts` - Backstory section parser, pgvector indexer, name lookup, keyword search
- `src/app/api/chat/history-compression.ts` - message windowing, scoring, tier assignment, summarization, digest fact extraction, RAG formatting
- `src/app/api/chat/depth-note.ts` - depth-2 scene grounding note builder
- `src/app/api/chat/system-prompt.ts` - system prompt construction, player control boundary, NPC guardrail
- `src/app/api/chat/stream-telemetry.ts` - tool call telemetry collection and stream callbacks
- `src/app/api/chat/tool-call-logger.ts` - shared dev logger for per-tool invocation summaries used by chat stream telemetry
- `src/app/api/state-update/route.ts` - automatic state update pipeline
- `src/app/api/state-rollback/route.ts` - rollback after message truncation
- `src/app/api/conversations/[id]/refresh-check/route.ts` - refresh eligibility, lease, and completion
- `src/app/api/conversations/[id]/slow-lane/route.ts` - slow-lane reconciliation, structural validation, repair, and persistence
- `src/app/api/presets/route.ts` - settings preset list/create route
- `src/app/api/presets/[id]/route.ts` - settings preset get/update/delete route
- `src/lib/preset-types.ts` - `SettingsPreset` interface for client-side preset data
- `src/lib/preset-client.ts` - typed fetch wrappers for preset CRUD
- `src/lib/hooks/use-presets.ts` - preset selection, save, update, delete hook for settings panel
- `src/app/api/story-projects/[id]/characters/[charId]/infer-sensory/route.ts` - LLM sensory inference endpoint
- `src/lib/hooks/use-state-pipeline.ts` - client trigger and cascade reset integration
- `src/lib/hooks/use-state-refresh.ts` - background polling for live state refresh
- `src/lib/hooks/use-conversation-manager.ts` - hydration, save lifecycle, switching
- `src/lib/state-pipeline/pipeline-socket.ts` - pipeline orchestration
- `src/components/sidebar/story-state-editor.tsx` - typed state editor container
- `src/components/sidebar/story-state-sections.tsx` - section-level state editors
- `src/components/sidebar/refresh-status.tsx` - refresh status indicator in story-state tab

## Guardrails and boundaries

- Import shared packages from root only: `@chatterbox/sockets`, `@chatterbox/prompt-assembly`, `@chatterbox/state-model`.
- Do not deep-import package internals (`src/*`).
- Use `@/*` alias for app-internal imports.
- Runtime DB fallback in `src/lib/env.ts` points at host port `55432`; keep infra/docs in sync if that mapping changes.
- Preserve module-scope mutable `liveConfig` in `page.tsx`; do not refactor it into React state.
- Story authoring routes must not read or mutate `liveConfig`; navigation between chat and stories stays explicit.

## End-to-end testing (Playwright)

E2E tests live in `apps/web/e2e/` and use `@playwright/test`.

### Directory structure

| Path                  | Purpose                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `e2e/auth.setup.ts`   | Auth setup project - registers/logs in e2e test user, saves storageState                         |
| `e2e/global-setup.ts` | Creates e2e database and runs migrations before test suite                                       |
| `e2e/fixtures/`       | Test fixtures (auth constants, data helpers)                                                     |
| `e2e/helpers/`        | Shared helpers (mock-chat-stream, seed-data)                                                     |
| `e2e/pages/`          | Page object models (ChatPage, LoginPage, StoriesPage)                                            |
| `e2e/smoke/`          | Phase 2 smoke tests (navigation, auth, chat, stories)                                            |
| `e2e/features/`       | Phase 3 feature tests (story CRUD, chat interactions, settings, sidebar, history, prompt editor) |

### Running tests

```bash
pnpm test:e2e            # headless, all browsers
pnpm test:e2e:ui         # interactive UI mode
pnpm test:e2e:headed     # headed browser
```

Root-level scripts delegate to `apps/web`. Both work identically.

### Key conventions

- Tests use a dedicated `chatterbox_e2e` database (not the dev database).
- Auth is enabled (`AUTH_ENABLED=true`) with a test session secret.
- `/api/chat` is mocked via Playwright route interception - no real LLM calls.
- The `mockChatStream` helper returns AI SDK data stream protocol chunks.
- Test data uses `e2eName()` prefix for cleanup isolation.
- Page objects use resilient selectors (role-based, text-based, label-based).
- `storageState` is shared across Chromium and WebKit projects after the setup project runs.

### Adding new e2e tests

1. For smoke coverage, add specs in `e2e/smoke/`.
2. For feature workflows, add specs in `e2e/features/`.
3. Use the `test` and `expect` from `e2e/fixtures/auth.ts` for authenticated tests.
4. For tests that need test data, use helpers from `e2e/fixtures/data.ts`.
5. Mock `/api/chat` with `mockChatStream()` from `e2e/helpers/mock-chat-stream.ts`.

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter web test:mutate` runs Stryker against `src/lib/state-pipeline/**` using `apps/web/stryker.config.mjs`
- `pnpm dev` starts successfully
- `src/components/sidebar/system-prompt-editor.tsx` — dual-mode: raw textarea when no segments exist, per-segment collapsible editor after import. Each segment card shows label, policy badge, token estimate, turns-since-included indicator, editable content, and optional omitted-summary text for skipped-turn context notes.
