---
description: "Use when working on entity-centric story state: StructuredStoryState types, entity resolution, markdown parsing/serialization, reconciliation, and section editors."
applyTo: "apps/web/src/lib/story-state-model.ts, apps/web/src/components/sidebar/story-state-*.tsx"
---

# Story State Model Conventions

## Entity-centric design

All character-referencing sections store `entityId` references, never name strings. An `Entity` has a stable UUID (`id`), `name`, `description`, and `isPlayerCharacter` flag.

## Key invariants

- **Entity UUIDs are stable.** Use `reconcileEntities(existing, incoming)` when the pipeline returns fresh state. It preserves existing UUIDs by name-matching and returns an `idRemap` to rewrite all section references.
- **Entities not in incoming are preserved** — the pipeline may omit characters it didn't update.
- **`findOrCreateEntity`** searches by exact name then partial token match. If no match, creates a new entity and mutates the array in place.

## Two-pass parsing (markdown → structured)

1. **Pass 1 — Entity extraction:** Parse the `## Cast` section to build the entity list (names → IDs).
2. **Pass 2 — ID resolution:** Parse all other sections, resolving character name strings to entity IDs via `findOrCreateEntity`.

`SECTION_MAP` maps heading names (case-insensitive) to `StructuredStoryState` keys.

## Serialization (structured → markdown)

`serializeStructuredState()` emits the `## Characters` grouped format (one `### CharName` per entity, with `#### Appearance` sub-sections). Do not emit the legacy flat `## Appearance` format.

## Section editors (`story-state-sections.tsx`)

- Character name fields use `EntitySelect` combobox with autocomplete from the entity registry.
- Typing an unknown name auto-creates a new entity on blur.
- `CharactersSection` groups entries by entity with collapsible sub-containers.
- Attribute rows auto-detect tag-style (comma-separated, no periods) vs prose.
