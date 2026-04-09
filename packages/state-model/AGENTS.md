# AGENTS.md - `@chatterbox/state-model`

## Purpose

`@chatterbox/state-model` is the entity-centric story state model package for the app.

It provides:

- framework-agnostic types for structured story state
- markdown parsing into `StructuredStoryState`
- markdown serialization from `StructuredStoryState`
- entity lookup, creation, reconciliation, and ID remapping helpers
- lifecycle reconciliation and inference-default hydration helpers
- presence scanning from assistant messages
- effective state resolution for baseline plus runtime state
- zero-runtime-dependency utilities that operate only on story state data

This package exists to keep story state logic modular, deterministic, and reusable without coupling it to Next.js, React, Prisma, AI SDK types, or app-specific orchestration.

## What belongs in this package

Allowed:

- `StructuredStoryState` types and related DTOs
- markdown parsers and serializers for story state
- entity registry operations and entity ID reconciliation
- lifecycle reconciliation and inference helpers
- presence scanning and effective state resolution
- small pure helpers that operate on story state data only

Not allowed:

- framework code (React hooks/components)
- route handlers or server runtime logic
- Prisma/database queries
- AI SDK-specific types
- state pipeline orchestration
- story project management or character derivation code that depends on app-level types

## Public API and usage

Only import from the package root:

```ts
import {
  applySectionMetaTransition,
  emptyStructuredState,
  ensureLifecycleDefaults,
  findEntityByName,
  findOrCreateEntity,
  parseMarkdownToStructured,
  reconcileEntities,
  reconcileLifecycleState,
  remapEntityIds,
  resolveEffectiveState,
  resolveEntityName,
  scanPresenceFromAssistantMessage,
  structuredToMarkdown,
  type AppearanceEntry,
  type AttributeCategory,
  type BehavioralCategory,
  type CustomSection,
  type DemeanorEntry,
  type EffectiveStateInput,
  type Entity,
  type FactTag,
  type HardFact,
  type Relationship,
  type RelationshipTone,
  type SceneInfo,
  type SectionMeta,
  type SectionMetaKey,
  type StoryThread,
  type StructuredStoryState,
} from "@chatterbox/state-model";
```

Do not deep-import internal files:

```ts
// forbidden
import { parseMarkdownToStructured } from "@chatterbox/state-model/src/parser";
```

`src/index.ts` is the only public entry point. Keep it as a clean barrel.

## Dependency graph

```text
apps/web -> @chatterbox/state-model
```

This package is a strict leaf package with zero cross-package dependencies and zero runtime dependencies.

## Module layout

| File                  | Responsibility                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`            | All shared types (`Entity`, `StructuredStoryState`, `SectionMeta`, etc.), empty state factory, and section meta helpers        |
| `entities.ts`         | Entity lookup (`findEntityByName`), creation (`findOrCreateEntity`), reconciliation, and ID remapping                          |
| `inference.ts`        | Attribute, tone, and tag inference, ID generation (`generateStoryItemId`), and text normalization                              |
| `lifecycle.ts`        | Lifecycle defaults (`ensureLifecycleDefaults`), state reconciliation (`reconcileLifecycleState`), and player-flag preservation |
| `parser.ts`           | Markdown -> `StructuredStoryState` entrypoint (`parseMarkdownToStructured`)                                                    |
| `parser-helpers.ts`   | Raw section parsing, section heading resolution, and internal parse types                                                      |
| `serializer.ts`       | `StructuredStoryState` -> markdown (`structuredToMarkdown`)                                                                    |
| `presence-scanner.ts` | Assistant-message presence scanning (`scanPresenceFromAssistantMessage`)                                                       |
| `effective-state.ts`  | Baseline plus runtime merge resolver (`resolveEffectiveState`)                                                                 |
| `index.ts`            | Public barrel - all external imports must go through here                                                                      |

## Key concepts

### Entity-centric model

All character-referencing sections store `entityId` references, not name strings. Entities carry a stable UUID `id`, plus `name`, `description`, and `isPlayerCharacter`.

### Two-pass parsing

`parseMarkdownToStructured` uses a two-pass approach:

1. Extract entities from the Cast section.
2. Resolve later character references to entity IDs using the extracted entity registry.

This keeps downstream sections normalized around stable IDs instead of display names.

### Lifecycle reconciliation

`reconcileLifecycleState` carries forward player flags, hydrates facts and threads with defaults, and archives superseded items.

`ensureLifecycleDefaults` fills missing inference-derived fields such as relationship tones, appearance categories, fact tags, summaries, and thread hooks.

Both functions accept an optional `today` parameter so date-sensitive behavior remains deterministic in validation and local tooling.

### Entity UUID stability

`reconcileEntities(existing, incoming)` preserves existing UUIDs by name matching and returns an `idRemap` so section references can be updated without losing continuity.

### Presence scanning

`scanPresenceFromAssistantMessage` detects likely arrivals and departures from assistant text, including simple negation-aware exit handling.

### Section meta tracking

`applySectionMetaTransition` compares previous and incoming structured state snapshots and bumps section `lastUpdatedAt` and `updateCount` only for sections whose content actually changed.

## Internal-only implementation details

The following symbols are internal helpers and should remain package-private unless there is a clear contract reason to expose them:

- `emptySectionMeta`
- `normalizeSectionMeta`
- `generateStoryItemId`
- `normalizeTextKey`
- `inferAttributeCategory`
- `inferRelationshipTone`
- `inferFactTags`
- `summarizeFact`
- `deriveThreadHook`
- `emptyRawSections`
- `parseRawSection`
- `resolveSection`
- all `Raw*` parser-helper types

## Test suite

Tests live in `src/__tests__/` and use vitest. Run with `pnpm --filter @chatterbox/state-model test`.

| File                       | Coverage                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.test.ts`            | `emptyStructuredState`, `emptySectionMeta`, `normalizeSectionMeta`, `applySectionMetaTransition`                                                   |
| `entities.test.ts`         | `resolveEntityName`, `findEntityByName`, `findOrCreateEntity`, `reconcileEntities`, `remapEntityIds`                                               |
| `inference.test.ts`        | `inferAttributeCategory`, `inferRelationshipTone`, `inferFactTags`, `summarizeFact`, `deriveThreadHook`, `generateStoryItemId`, `normalizeTextKey` |
| `lifecycle.test.ts`        | `reconcileLifecycleState`, `ensureLifecycleDefaults`                                                                                               |
| `parser.test.ts`           | `parseMarkdownToStructured` -- empty input, each section type, custom sections, full roundtrip                                                     |
| `serializer.test.ts`       | `structuredToMarkdown` -- section output, filtering, timestamps, roundtrip                                                                         |
| `presence-scanner.test.ts` | `scanPresenceFromAssistantMessage` -- arrival, exit, negation, first-name matching                                                                 |
| `effective-state.test.ts`  | `resolveEffectiveState` -- null handling, list merge, scene merge                                                                                  |

## Strict boundary rules

This package is enforced as a leaf package.

1. Import boundary
   - `packages/state-model` must not import from app packages or other workspace packages.
   - The package must keep zero cross-package runtime dependencies.

2. Type boundary
   - Public types must remain framework-agnostic and app-agnostic.
   - Conversion to Prisma models, UI state, or AI SDK payloads happens outside this package.

3. Export boundary
   - `package.json` `exports` exposes only `.`
   - Internals under `src/*` are private implementation details.

4. No build step
   - The package exposes `./src/index.ts` directly.
   - The consuming app's bundler compiles it. Do not add a `dist/` build output contract.

## Extending this package

When adding new state-model functionality:

1. Add types or helpers that operate on `StructuredStoryState` or closely related entities.
2. Keep implementations pure and dependency-free.
3. Export new public contracts from `src/index.ts`.
4. Keep parser-only, inference-only, or lifecycle-only helpers internal unless app code genuinely needs them.
5. Ensure app integrations consume the package from the root export only.

## Validation checklist

Before merging state-model changes, verify:

- `pnpm --filter @chatterbox/state-model typecheck`
- `pnpm --filter @chatterbox/state-model lint`
- `pnpm --filter @chatterbox/state-model test`
- app still compiles when consuming from `@chatterbox/state-model` root exports only
- Package tooling relies on the `typescript-eslint` meta package; do not add a direct `@typescript-eslint/parser` dependency unless a config explicitly needs it.
