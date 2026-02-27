---
Status: Completed
Last Updated: 2026-02-14 16:00
Supersedes: IM03 (extends, does not replace — IM03's structured model and markdown serialization remain; this refactors the internal identity model)
---
# IM04 — Entity-Centric Story State

## Origin

During IM03 implementation (story state atomization), the structured model was built as **section-centric**: arrays of typed objects (CastMember, Relationship, AppearanceEntry, etc.) that each contain inline name strings. This creates several problems observable in real story state files:

1. **No referential integrity.** In `story-state-alex.md`, the relationship `{{ char }} → Marco` references "Marco" — but Marco has no Cast entry. The system has no way to know these are related or that Marco is missing from Cast.

2. **No name propagation.** If the user renames `{{ char }}` to "Alex" in the Cast section, the name `{{ char }}` remains in Relationships, Appearance, Demeanor, Scene, Open Threads, and Hard Facts. The user must manually find-and-replace across every section.

3. **No entity-scoped views.** There's no way to ask "show me everything about Alex" — her cast bio, relationships, appearance entries, and demeanor are scattered across independent arrays with no linking key.

4. **Pipeline merge ambiguity.** When the state pipeline merges new facts (e.g., `appearance_change` for `{{ char }}`), it relies on the LLM to match the name string in the fact to the name string in the appearance section. Name mismatches (abbreviations, aliases, `{{ char }}` vs real name) cause merge failures.

## Goal

Refactor the internal `StructuredStoryState` model so that **characters are first-class entities** with stable identities. All character-referencing sections (Cast, Relationships, Appearance, Demeanor, Scene presence) link to entities by ID rather than by duplicated name strings.

### Non-goals

- **No new databases or services.** This is a client-side data model refactor. No Qdrant, no vector DB, no server changes.
- **No changes to markdown output.** The serializer still produces identical markdown for LLM injection. Entity IDs are an internal concept only.
- **No changes to the state pipeline server routes.** The pipeline continues to receive and return markdown strings. Entity resolution happens client-side when re-parsing pipeline output.

---

## Design

### Core types

```typescript
/** Stable identity for a character across all sections. */
interface Entity {
  id: string;              // UUID, stable across renames
  name: string;            // display name — "{{ char }}", "Alex", "Marco"
  isPlayerCharacter: boolean;
  description: string;     // cast bio (moved from CastMember)
}

/** Entity registry — single source of truth for all character names. */
interface EntityRegistry {
  entities: Entity[];
}
```

### Section types (updated to reference entity IDs)

```typescript
interface Relationship {
  fromEntityId: string;    // was: from: string
  toEntityId: string;      // was: to: string
  description: string;
  details: string[];
}

interface AppearanceEntry {
  entityId: string;        // was: character: string
  attribute: string;
  description: string;
}

interface DemeanorEntry {
  entityId: string;        // was: character: string
  mood: string;
  energy: string;
}

interface SceneInfo {
  location: string;
  presentEntityIds: string[];  // was: present: string[]
  atmosphere: string;
}
```

### Unchanged section types

These sections don't reference characters by name in their structure (though they may mention names in free text):

```typescript
interface StoryThread { description: string; }
interface HardFact { fact: string; }
interface CustomSection { heading: string; content: string; }
// style: string[]
```

> **Note on Hard Facts and Open Threads:** These contain free-text that may mention entity names (e.g., "{{ char }} co-owns a tattoo studio with Marco"). We do **not** convert these to entity ID references — they remain plain strings. The serializer does not need to resolve IDs in these sections. However, a future enhancement could scan these for entity name mentions and offer to update them on rename (see Future Work).

### Top-level model

```typescript
interface StructuredStoryState {
  entities: Entity[];
  relationships: Relationship[];
  appearance: AppearanceEntry[];
  scene: SceneInfo;
  demeanor: DemeanorEntry[];
  openThreads: StoryThread[];
  hardFacts: HardFact[];
  style: string[];
  custom: CustomSection[];
}
```

The `cast: CastMember[]` array is **removed**. Cast is now the `entities` array itself. Each entity's `description` field replaces `CastMember.description`.

---

## Entity lifecycle

### Creation

Entities are created in three ways:

1. **Import parsing.** When markdown is imported, the parser scans all sections for character name references and builds a deduplicated entity registry. Names are matched case-insensitively and trimmed. Each unique name gets a new UUID.

2. **Manual addition.** The user clicks "Add cast member" in the UI, which creates a new Entity with a generated UUID and empty name/description.

3. **Implicit creation from references.** When the user adds a relationship target (e.g., types "Marco" in the "To" field) and no entity named "Marco" exists, the system auto-creates a new Entity `{ id: uuid(), name: "Marco", isPlayerCharacter: false, description: "" }`. The UI should surface this with a brief notification: "Created new entity: Marco".

### Renaming

When an entity's `name` is changed:

1. The `Entity.name` field is updated in the registry.
2. All sections that reference this entity by ID automatically display the new name (they resolve `entityId → entity.name` at render time).
3. The markdown serializer resolves `entityId → entity.name` at serialization time, so the LLM sees the updated name everywhere.
4. **Free-text fields** (Hard Facts, Open Threads, relationship descriptions, appearance descriptions) are **not** auto-updated. The UI should offer a "Replace in text" action: "Also update '{{ char }}' → 'Alex' in 3 text fields?" This is opt-in to avoid corrupting carefully written prose.

### Deletion

When an entity is deleted:

1. The UI checks for references: "This entity is referenced by 2 relationships, 4 appearance entries, and 1 demeanor entry. Delete all references too?"
2. If confirmed, all referencing items are removed.
3. The entity is removed from `scene.presentEntityIds` if present.

### Merge (from pipeline)

When the state pipeline returns updated markdown:

1. `parseMarkdownToStructured()` runs on the new markdown, producing a fresh `StructuredStoryState`.
2. **Entity reconciliation**: The parser matches entities in the new state to existing entities by name (case-insensitive, trimmed). Matched entities keep their existing UUID. Unmatched new names get new UUIDs. Entities in the old state that don't appear in the new state are preserved (the pipeline may have simply not mentioned them).
3. This reconciliation preserves entity identity across pipeline updates, so UI state (collapsed sections, scroll position) tied to entity IDs remains stable.

---

## Parser changes

The current parser (`parseMarkdownToStructured`) processes sections independently. The entity-centric parser adds a **two-pass approach**:

### Pass 1: Entity extraction

Scan all sections and collect every character name reference:

| Section | Name extraction pattern |
|---------|----------------------|
| Cast | `- **Name** — description` → name |
| Relationships | `- **From → To**: ...` → from, to |
| Appearance | `- **Character — attribute**: ...` → character |
| Demeanor | `- **Character's mood**: ...` → character |
| Scene | `Who is present: A, B, C` → each name |

Deduplicate by case-insensitive match. Assign UUIDs. Detect player characters from `[player character` in cast descriptions.

### Pass 2: Section parsing with entity resolution

Parse each section as before, but replace inline name strings with entity ID lookups:

```typescript
// Example: parsing a relationship entry
const fromEntity = findOrCreateEntity(registry, fromName);
const toEntity = findOrCreateEntity(registry, toName);
return { fromEntityId: fromEntity.id, toEntityId: toEntity.id, description, details };
```

`findOrCreateEntity` does case-insensitive name matching against the registry. If no match, creates a new entity (this handles the "Marco in relationships but not in cast" case).

---

## Serializer changes

The serializer (`structuredToMarkdown`) currently reads name strings directly from section objects. With entity IDs, it resolves names at serialization time:

```typescript
function serializeCast(entities: Entity[]): string {
  return entities
    .map(e => `- **${e.name}** — ${e.description}`)
    .join("\n");
}

function serializeRelationships(rels: Relationship[], entities: Entity[]): string {
  return rels.map(r => {
    const from = resolveEntityName(entities, r.fromEntityId);
    const to = resolveEntityName(entities, r.toEntityId);
    let line = `- **${from} → ${to}**: ${r.description}`;
    if (r.details.length > 0) {
      line += "\n" + r.details.map(d => `  - ${d}`).join("\n");
    }
    return line;
  }).join("\n");
}
```

The markdown output is **identical** to what the current serializer produces. The only difference is where the name string comes from (entity registry vs inline field).

---

## UI changes

### Cast section → Entity list

The current `CastSection` component edits `CastMember[]`. It becomes an **Entity editor** that edits `Entity[]` directly:

- Name field edits `entity.name` (with propagation to all referencing sections)
- Description field edits `entity.description`
- PC badge reflects `entity.isPlayerCharacter`
- Delete button triggers the referential integrity check described above

### Relationship section

- "From" and "To" fields become **entity selectors** (dropdown/combobox) that select from the entity registry, rather than free-text inputs.
- Typing a name that doesn't exist in the registry offers "Create new entity: [name]" as an option.
- The display still shows the entity's current name.

### Appearance section

- "Character" field becomes an **entity selector**.
- Attribute and description remain free-text.

### Demeanor section

- Character field becomes an **entity selector**.

### Scene section

- "Who is present" becomes a **multi-select entity picker** instead of a comma-separated text field.

### Entity-scoped view (future, optional)

A potential future enhancement: clicking an entity name anywhere opens a panel showing all properties of that entity aggregated from all sections. This is not required for the initial implementation but the data model supports it naturally.

---

## Storage migration

### Schema change

The `Conversation.structuredState` field changes shape. Existing conversations have the old `{ cast: CastMember[], ... }` format. Migration strategy:

```typescript
function migrateStructuredState(old: OldStructuredStoryState): StructuredStoryState {
  // Pass 1: Build entity registry from old cast + all name references
  const registry = buildEntityRegistryFromOld(old);
  
  // Pass 2: Convert section arrays to use entity IDs
  return {
    entities: registry,
    relationships: old.relationships.map(r => ({
      fromEntityId: findEntityByName(registry, r.from)!.id,
      toEntityId: findEntityByName(registry, r.to)!.id,
      description: r.description,
      details: r.details,
    })),
    appearance: old.appearance.map(a => ({
      entityId: findEntityByName(registry, a.character)!.id,
      attribute: a.attribute,
      description: a.description,
    })),
    scene: {
      location: old.scene.location,
      presentEntityIds: old.scene.present.map(name => findOrCreateEntity(registry, name).id),
      atmosphere: old.scene.atmosphere,
    },
    demeanor: old.demeanor.map(d => ({
      entityId: findEntityByName(registry, d.character)!.id,
      mood: d.mood,
      energy: d.energy,
    })),
    openThreads: old.openThreads,
    hardFacts: old.hardFacts,
    style: old.style,
    custom: old.custom,
  };
}
```

### Detection

On `loadConversation`, check for the presence of `entities` array (new format) vs `cast` array (old format). If old format, run migration.

---

## State pipeline integration

### No server changes

The state pipeline (`/api/state-update`) continues to:
1. Receive `currentStoryState` as a markdown string
2. Extract facts, merge, validate
3. Return `newState` as a markdown string

### Client-side reconciliation

When the client receives updated markdown from the pipeline:

1. Parse it with `parseMarkdownToStructured()` (which now builds entity registry from names)
2. **Reconcile entities**: Match new entities to existing entities by name. Preserve existing UUIDs for matched entities. Assign new UUIDs for genuinely new characters.
3. Replace the structured state with the reconciled result.

This is the same flow as today (`updateStoryStateFromSummary` in `use-field-setters.ts`), just with the added entity reconciliation step.

### Future: entity-aware pipeline

A future enhancement could send entity IDs to the pipeline so it can do entity-scoped merges (e.g., "update only Alex's appearance"). This would require the pipeline to understand entity IDs, which is out of scope for this implementation.

---

## Implementation plan

### Step 1: Types and entity registry

**File:** `apps/web/src/lib/story-state-model.ts`

- Define `Entity` interface
- Update `Relationship`, `AppearanceEntry`, `DemeanorEntry`, `SceneInfo` to use `entityId` references
- Remove `CastMember` interface (replaced by `Entity`)
- Update `StructuredStoryState` to have `entities: Entity[]` instead of `cast: CastMember[]`
- Add `resolveEntityName(entities, id)` helper
- Add `findOrCreateEntity(registry, name)` helper

### Step 2: Parser refactor

**File:** `apps/web/src/lib/story-state-model.ts`

- Implement two-pass parsing: entity extraction → section parsing with ID resolution
- Update all sub-parsers to return entity ID references
- Add entity reconciliation function for pipeline merge use case

### Step 3: Serializer refactor

**File:** `apps/web/src/lib/story-state-model.ts`

- Update all serializer functions to accept entity registry and resolve IDs → names
- Verify markdown output is identical to current output (round-trip test)

### Step 4: Storage migration

**File:** `apps/web/src/lib/storage.ts`

- Add migration function for old → new structured state format
- Update `loadConversation` to detect and migrate old format

### Step 5: UI — Entity selectors

**Files:** `apps/web/src/components/sidebar/story-state-editor.tsx`

- Replace Cast section with Entity editor
- Replace free-text character name fields with entity selector comboboxes in Relationships, Appearance, Demeanor
- Replace Scene "present" text field with multi-select entity picker
- Add implicit entity creation when typing unknown names
- Add entity deletion with referential integrity warnings
- Add "Replace in text" option on entity rename for free-text fields

### Step 6: Hooks and field setters

**Files:** `apps/web/src/lib/hooks/use-field-setters.ts`

- Update `handleStructuredStateUpdate` for new type shape
- Add entity CRUD helpers: `addEntity`, `renameEntity`, `deleteEntity`
- Update `updateStoryStateFromSummary` to include entity reconciliation

### Step 7: Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm dev` starts successfully
- Import `story-state-alex.md` → verify Marco auto-created as entity from relationship reference
- Rename `{{ char }}` → "Alex" in entity editor → verify name updates in all sections
- Delete an entity → verify referential integrity warning and cascade delete
- Run state pipeline → verify entity reconciliation preserves IDs
- Round-trip test: import → serialize → re-import produces identical structured state

---

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Entity name matching is fuzzy (e.g., "{{ char }}" vs "Sabrina" vs "Sab") | Case-insensitive exact match only. Fuzzy matching is a future enhancement. Users can manually merge entities if the parser creates duplicates. |
| Free-text fields contain entity names that don't auto-update on rename | Opt-in "Replace in text" action. Clear UI indication that free-text fields are not auto-updated. |
| Pipeline returns markdown with new character names that don't match existing entities | Entity reconciliation creates new entities for unmatched names. User can manually merge if needed. |
| Migration breaks existing conversations | Migration is deterministic and reversible (old format can always be re-parsed from the markdown string). |
| Entity selector combobox adds UI complexity | Keep free-text typing as primary input with autocomplete from entity registry. Don't force dropdown-only selection. |

---

## Future work (out of scope)

- **Entity-scoped view panel**: Click an entity to see all their properties aggregated
- **Fuzzy entity matching**: Handle aliases, abbreviations, `{{ char }}` ↔ real name mapping
- **Entity-aware pipeline**: Send entity IDs to server for scoped merges
- **Free-text entity scanning**: Automatically detect entity name mentions in Hard Facts, Open Threads, etc. and offer to link them
- **Entity portraits/avatars**: Visual identity for entities in the UI
- **Qdrant/vector DB**: For semantic memory retrieval across conversations — a separate system from entity identity
