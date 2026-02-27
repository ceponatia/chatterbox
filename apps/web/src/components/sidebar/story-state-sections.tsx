"use client";

import { useState, useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, Trash2, User } from "lucide-react";
import type {
  StructuredStoryState,
  Entity,
  Relationship,
  AppearanceEntry,
  DemeanorEntry,
  StoryThread,
  HardFact,
  AttributeCategory,
  FactTag,
  RelationshipTone,
} from "@/lib/story-state-model";
import { resolveEntityName, findOrCreateEntity } from "@/lib/story-state-model";
import { DeferredInput, DeferredTextarea } from "./deferred-inputs";
import {
  EntityCard,
  EntitySelect,
  keyedByBase,
  SectionShell,
} from "./section-primitives";
import {
  ArchivedThreadsModal,
  ArchivedFactsModal,
} from "./archive-detail-modal";
export {
  BulletListSection,
  TimestampedBulletListSection,
  CustomSectionEditor,
} from "./bullet-list-sections";

const RELATIONSHIP_TONES: RelationshipTone[] = [
  "hostile",
  "cold",
  "neutral",
  "warm",
  "close",
  "intimate",
];

const ATTRIBUTE_CATEGORIES: AttributeCategory[] = [
  "face",
  "hair",
  "build",
  "outfit",
  "voice",
  "scent",
  "movement",
  "presence",
];

// ---------------------------------------------------------------------------
// Typed section editors
// ---------------------------------------------------------------------------

export function EntitiesSection({
  entities,
  onUpdate,
}: {
  entities: Entity[];
  onUpdate: (entities: Entity[]) => void;
}) {
  const update = (i: number, patch: Partial<Entity>) =>
    onUpdate(entities.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const add = () =>
    onUpdate([
      ...entities,
      {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "",
        description: "",
        isPlayerCharacter: false,
      },
    ]);
  const remove = (i: number) =>
    onUpdate(entities.filter((_, idx) => idx !== i));

  return (
    <SectionShell title="Cast" badge={`${entities.length}`}>
      {entities.map((e, i) => (
        <EntityCard
          key={e.id}
          label={e.name || "(unnamed)"}
          badge={
            e.isPlayerCharacter ? (
              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                <User className="h-2.5 w-2.5 mr-0.5" />
                PC
              </Badge>
            ) : undefined
          }
          onRemove={() => remove(i)}
        >
          <DeferredInput
            value={e.name}
            onCommit={(val) => update(i, { name: val })}
            placeholder="Character name"
            className="h-7 text-[11px]"
          />
          <DeferredTextarea
            value={e.description}
            onCommit={(val) => update(i, { description: val })}
            placeholder="Description..."
            className="min-h-12 font-mono text-[11px] leading-relaxed"
            rows={2}
          />
        </EntityCard>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add cast member
      </Button>
    </SectionShell>
  );
}

export function RelationshipsSection({
  relationships,
  entities,
  onUpdate,
  onEntitiesUpdate,
}: {
  relationships: Relationship[];
  entities: Entity[];
  onUpdate: (rels: Relationship[]) => void;
  onEntitiesUpdate: (entities: Entity[]) => void;
}) {
  const update = (i: number, patch: Partial<Relationship>) =>
    onUpdate(
      relationships.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );

  const add = () =>
    onUpdate([
      ...relationships,
      {
        fromEntityId: "",
        toEntityId: "",
        description: "",
        details: [],
        tone: "neutral",
      },
    ]);
  const remove = (i: number) =>
    onUpdate(relationships.filter((_, idx) => idx !== i));
  const relationshipKeys = keyedByBase(relationships, (rel) =>
    [
      rel.fromEntityId,
      rel.toEntityId,
      rel.description.trim(),
      rel.details.join("|"),
    ].join("::"),
  );

  return (
    <SectionShell title="Relationships" badge={`${relationships.length}`}>
      <datalist id="entity-names">
        {entities.map((e) => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>
      {relationships.map((r, i) => {
        const fromName = resolveEntityName(entities, r.fromEntityId);
        const toName = resolveEntityName(entities, r.toEntityId);
        const stableKey = relationshipKeys[i] ?? `${fromName}-${toName}`;
        return (
          <EntityCard
            key={stableKey}
            label={`${fromName || "?"} → ${toName || "?"}`}
            onRemove={() => remove(i)}
          >
            <div className="flex gap-1.5">
              <EntitySelect
                entityId={r.fromEntityId}
                entities={entities}
                onChange={(id) => update(i, { fromEntityId: id })}
                onCreateNew={(name) => {
                  const updated = [...entities];
                  const entity = findOrCreateEntity(updated, name);
                  onEntitiesUpdate(updated);
                  update(i, { fromEntityId: entity.id });
                }}
                placeholder="From"
              />
              <span className="self-center text-[11px] text-muted-foreground">
                →
              </span>
              <EntitySelect
                entityId={r.toEntityId}
                entities={entities}
                onChange={(id) => update(i, { toEntityId: id })}
                onCreateNew={(name) => {
                  const updated = [...entities];
                  const entity = findOrCreateEntity(updated, name);
                  onEntitiesUpdate(updated);
                  update(i, { toEntityId: entity.id });
                }}
                placeholder="To"
              />
            </div>
            <DeferredTextarea
              value={r.description}
              onCommit={(val) => update(i, { description: val })}
              placeholder="Relationship description..."
              className="min-h-12 font-mono text-[11px] leading-relaxed"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground">Tone</label>
              <select
                className="h-7 rounded border bg-background px-2 text-[11px]"
                value={r.tone ?? "neutral"}
                onChange={(e) =>
                  update(i, { tone: e.target.value as RelationshipTone })
                }
              >
                {RELATIONSHIP_TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </div>
            {r.details.length > 0 && (
              <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted">
                {r.details.map((d, di) => (
                  <div key={di} className="flex gap-1 items-start">
                    <span className="text-[10px] text-muted-foreground mt-1">
                      •
                    </span>
                    <DeferredTextarea
                      value={d}
                      onCommit={(val) => {
                        const newDetails = [...r.details];
                        newDetails[di] = val;
                        update(i, { details: newDetails });
                      }}
                      className="min-h-8 font-mono text-[10px] leading-relaxed flex-1"
                      rows={1}
                    />
                  </div>
                ))}
              </div>
            )}
          </EntityCard>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add relationship
      </Button>
    </SectionShell>
  );
}

/** Split description into comma-separated tag values. Always tag-style. */
function splitTags(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Group appearance entries by entityId, preserving original indices. */
function groupByEntity(
  entries: AppearanceEntry[],
): Map<string, { entry: AppearanceEntry; origIdx: number }[]> {
  const groups = new Map<
    string,
    { entry: AppearanceEntry; origIdx: number }[]
  >();
  entries.forEach((entry, origIdx) => {
    const group = groups.get(entry.entityId) ?? [];
    group.push({ entry, origIdx });
    groups.set(entry.entityId, group);
  });
  return groups;
}

export function CharactersSection({
  entries,
  entities,
  onUpdate,
}: {
  entries: AppearanceEntry[];
  entities: Entity[];
  onUpdate: (entries: AppearanceEntry[]) => void;
}) {
  const update = (i: number, patch: Partial<AppearanceEntry>) =>
    onUpdate(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const addForEntity = (entityId: string) =>
    onUpdate([
      ...entries,
      {
        entityId,
        attribute: "",
        description: "",
        category: "presence",
      },
    ]);
  const addNew = () =>
    onUpdate([
      ...entries,
      {
        entityId: entities[0]?.id ?? "",
        attribute: "",
        description: "",
        category: "presence",
      },
    ]);
  const remove = (i: number) => onUpdate(entries.filter((_, idx) => idx !== i));

  const grouped = useMemo(() => groupByEntity(entries), [entries]);

  return (
    <SectionShell title="Characters" badge={`${entries.length}`}>
      {[...grouped.entries()].map(([entityId, items]) => {
        const charName = resolveEntityName(entities, entityId);
        const itemKeys = keyedByBase(items, ({ entry }) =>
          [entry.attribute.trim(), entry.description.trim()].join("::"),
        );
        return (
          <div key={entityId} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] font-medium">
                {charName || "(unknown)"}
              </span>
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {items.length}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="relative ml-auto h-5 px-1 text-[10px] before:absolute before:-inset-2 before:content-['']"
                onClick={() => addForEntity(entityId)}
              >
                <Plus className="h-2.5 w-2.5" />
              </Button>
            </div>
            <div className="text-[10px] font-medium text-muted-foreground px-1 pt-0.5">
              Appearance
            </div>
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted">
              {items.map(({ entry: e, origIdx }, localIdx) => (
                <AppearanceAttributeRow
                  key={itemKeys[localIdx] ?? `${e.attribute}-${e.description}`}
                  attribute={e.attribute}
                  description={e.description}
                  onAttributeChange={(val) =>
                    update(origIdx, { attribute: val })
                  }
                  onDescriptionChange={(val) =>
                    update(origIdx, { description: val })
                  }
                  category={e.category ?? "presence"}
                  onCategoryChange={(val) => update(origIdx, { category: val })}
                  onRemove={() => remove(origIdx)}
                />
              ))}
            </div>
          </div>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={addNew}
      >
        <Plus className="mr-1 h-3 w-3" /> Add character entry
      </Button>
    </SectionShell>
  );
}

/** Split description into individual values, update one, and rejoin. */
function updateTagAtIndex(
  description: string,
  idx: number,
  val: string,
): string {
  const parts = description.split(",").map((s) => s.trim());
  parts[idx] = val.trim();
  return parts.filter(Boolean).join(", ");
}

function removeTagAtIndex(description: string, idx: number): string {
  const parts = description.split(",").map((s) => s.trim());
  parts.splice(idx, 1);
  return parts.filter(Boolean).join(", ");
}

function addTag(description: string): string {
  const trimmed = description.trim();
  return trimmed ? `${trimmed}, new` : "new";
}

function AppearanceAttributeRow({
  attribute,
  description,
  category,
  onCategoryChange,
  onAttributeChange,
  onDescriptionChange,
  onRemove,
}: {
  attribute: string;
  description: string;
  category: AttributeCategory;
  onCategoryChange: (val: AttributeCategory) => void;
  onAttributeChange: (val: string) => void;
  onDescriptionChange: (val: string) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const contentId = `attr-${uid}`;
  const [expanded, setExpanded] = useState(true);
  const tagValues = splitTags(description);

  return (
    <div className="rounded border bg-muted/20">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          className="relative text-muted-foreground shrink-0 before:absolute before:-inset-2 before:content-['']"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="h-2.5 w-2.5" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5" />
          )}
        </button>
        <DeferredInput
          value={attribute}
          onCommit={onAttributeChange}
          placeholder="Attribute (e.g. eyes, hair, outfit)"
          className="h-5 text-[11px] font-medium flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <select
          className="h-5 rounded border bg-background px-1 text-[9px]"
          value={category}
          onChange={(e) =>
            onCategoryChange(e.target.value as AttributeCategory)
          }
        >
          {ATTRIBUTE_CATEGORIES.map((entryCategory) => (
            <option key={entryCategory} value={entryCategory}>
              {entryCategory}
            </option>
          ))}
        </select>
        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
          {tagValues.length}
        </Badge>
        <button
          type="button"
          onClick={onRemove}
          className="relative text-muted-foreground hover:text-destructive shrink-0 before:absolute before:-inset-2 before:content-['']"
          title="Remove attribute"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {expanded && (
        <div id={contentId} className="border-t px-2 py-1.5">
          <div className="flex flex-col gap-0.5">
            {tagValues.map((tag, ti) => (
              <div key={ti} className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground">•</span>
                <DeferredInput
                  value={tag}
                  onCommit={(val) =>
                    onDescriptionChange(updateTagAtIndex(description, ti, val))
                  }
                  className="h-5 text-[10px] flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
                <button
                  type="button"
                  onClick={() =>
                    onDescriptionChange(removeTagAtIndex(description, ti))
                  }
                  className="relative text-muted-foreground hover:text-destructive shrink-0 before:absolute before:-inset-2 before:content-['']"
                  title="Remove value"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="relative self-start h-5 px-1 text-[9px] before:absolute before:-inset-2 before:content-['']"
              onClick={() => onDescriptionChange(addTag(description))}
            >
              <Plus className="h-2.5 w-2.5 mr-0.5" /> value
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SceneSection({
  scene,
  entities,
  onUpdate,
}: {
  scene: StructuredStoryState["scene"];
  entities: Entity[];
  onUpdate: (scene: StructuredStoryState["scene"]) => void;
}) {
  const presentNames = scene.presentEntityIds.map((id) =>
    resolveEntityName(entities, id),
  );

  const togglePresent = (entityId: string) => {
    const exists = scene.presentEntityIds.includes(entityId);
    const presentEntityIds = exists
      ? scene.presentEntityIds.filter((id) => id !== entityId)
      : [...scene.presentEntityIds, entityId];
    onUpdate({ ...scene, presentEntityIds });
  };

  return (
    <SectionShell title="Scene">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">
          Where / When
        </label>
        <DeferredInput
          value={scene.location}
          onCommit={(val) => onUpdate({ ...scene, location: val })}
          placeholder="Location and time..."
          className="h-7 text-[11px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">
          Who is present
        </label>
        <div className="flex flex-wrap gap-1">
          {entities.map((entity) => {
            const selected = scene.presentEntityIds.includes(entity.id);
            return (
              <Button
                key={entity.id}
                type="button"
                variant={selected ? "secondary" : "outline"}
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => togglePresent(entity.id)}
              >
                {entity.name || entity.id}
              </Button>
            );
          })}
          {entities.length === 0 && (
            <span className="text-[10px] text-muted-foreground">
              Add cast members first to toggle scene presence.
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {presentNames.length > 0
            ? `Present: ${presentNames.join(", ")}`
            : "Present: none selected"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">Atmosphere</label>
        <DeferredInput
          value={scene.atmosphere}
          onCommit={(val) => onUpdate({ ...scene, atmosphere: val })}
          placeholder="Atmosphere..."
          className="h-7 text-[11px]"
        />
      </div>
    </SectionShell>
  );
}

export function DemeanorSection({
  entries,
  entities,
  onUpdate,
  onEntitiesUpdate,
}: {
  entries: DemeanorEntry[];
  entities: Entity[];
  onUpdate: (entries: DemeanorEntry[]) => void;
  onEntitiesUpdate: (entities: Entity[]) => void;
}) {
  const update = (i: number, patch: Partial<DemeanorEntry>) =>
    onUpdate(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const add = () =>
    onUpdate([
      ...entries,
      { entityId: entities[0]?.id ?? "", mood: "", energy: "" },
    ]);
  const remove = (i: number) => onUpdate(entries.filter((_, idx) => idx !== i));
  const demeanorKeys = keyedByBase(entries, (entry) =>
    [entry.entityId, entry.mood.trim(), entry.energy.trim()].join("::"),
  );

  return (
    <SectionShell title="Current Demeanor" badge={`${entries.length}`}>
      {entries.map((e, i) => (
        <EntityCard
          key={demeanorKeys[i] ?? resolveEntityName(entities, e.entityId)}
          label={resolveEntityName(entities, e.entityId) || "General"}
          onRemove={() => remove(i)}
        >
          <EntitySelect
            entityId={e.entityId}
            entities={entities}
            onChange={(id) => update(i, { entityId: id })}
            onCreateNew={(name) => {
              const updated = [...entities];
              const entity = findOrCreateEntity(updated, name);
              onEntitiesUpdate(updated);
              update(i, { entityId: entity.id });
            }}
            placeholder="Character"
          />
          <div className="flex gap-1.5">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Mood</label>
              <DeferredInput
                value={e.mood}
                onCommit={(val) => update(i, { mood: val })}
                className="h-7 text-[11px]"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">
                Energy
              </label>
              <DeferredInput
                value={e.energy}
                onCommit={(val) => update(i, { energy: val })}
                className="h-7 text-[11px]"
              />
            </div>
          </div>
        </EntityCard>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add demeanor
      </Button>
    </SectionShell>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseFactTags(input: string): FactTag[] {
  return input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag): tag is FactTag => {
      return [
        "biographical",
        "spatial",
        "relational",
        "temporal",
        "world",
        "event",
      ].includes(tag);
    });
}

export function OpenThreadsSection({
  entries,
  onUpdate,
}: {
  entries: StoryThread[];
  onUpdate: (entries: StoryThread[]) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const active = entries.filter(
    (t) => t.status === "active" || t.status === "evolved",
  );
  const archived = entries.filter(
    (t) => t.status === "resolved" || t.status === "stale",
  );

  const updateById = (id: string, patch: Partial<StoryThread>) =>
    onUpdate(entries.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeById = (id: string) =>
    onUpdate(entries.filter((t) => t.id !== id));
  const add = () =>
    onUpdate([
      ...entries,
      {
        id: `thread-${Date.now()}`,
        description: "",
        hook: "",
        resolutionHint: "",
        lastReferencedAt: todayIso(),
        status: "active",
        createdAt: todayIso(),
      },
    ]);

  return (
    <SectionShell title="Open Threads" badge={`${active.length}`}>
      {active.map((thread) => (
        <EntityCard
          key={thread.id}
          label={thread.description || "(new thread)"}
          badge={
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {thread.status}
            </Badge>
          }
          onRemove={() => removeById(thread.id)}
        >
          <DeferredTextarea
            value={thread.description}
            onCommit={(val) => updateById(thread.id, { description: val })}
            placeholder="Thread description..."
            className="min-h-10 font-mono text-[11px] leading-relaxed"
            rows={2}
          />
          <DeferredInput
            value={thread.hook ?? ""}
            onCommit={(val) => updateById(thread.id, { hook: val })}
            placeholder="Thread hook (short evocative label)"
            className="h-7 text-[11px]"
          />
          <DeferredInput
            value={thread.resolutionHint}
            onCommit={(val) => updateById(thread.id, { resolutionHint: val })}
            placeholder="Resolution hint (what would resolve this?)"
            className="h-7 text-[11px]"
          />
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-muted-foreground">Status</label>
            <select
              className="h-7 rounded border bg-background px-2 text-[11px]"
              value={thread.status}
              onChange={(e) =>
                updateById(thread.id, {
                  status: e.target.value as StoryThread["status"],
                })
              }
            >
              <option value="active">active</option>
              <option value="evolved">evolved</option>
              <option value="resolved">resolved</option>
              <option value="stale">stale</option>
            </select>
            <span className="text-[10px] text-muted-foreground">
              ref {thread.lastReferencedAt ?? "-"}
            </span>
          </div>
          {thread.lifecycleRejection && (
            <div className="rounded bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-400">
              <span className="font-medium">Removal blocked: </span>
              {thread.lifecycleRejection}
            </div>
          )}
        </EntityCard>
      ))}
      {archived.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 self-start text-[10px]"
          onClick={() => setArchiveOpen(true)}
        >
          Archived ({archived.length})
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add thread
      </Button>
      <ArchivedThreadsModal
        threads={archived}
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onRestore={(id) => updateById(id, { status: "active" })}
      />
    </SectionShell>
  );
}

export function HardFactsSection({
  entries,
  onUpdate,
}: {
  entries: HardFact[];
  onUpdate: (entries: HardFact[]) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const active = entries.filter((f) => !f.superseded);
  const archived = entries.filter((f) => f.superseded);

  const updateAt = (index: number, patch: Partial<HardFact>) =>
    onUpdate(entries.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const removeAt = (index: number) =>
    onUpdate(entries.filter((_, i) => i !== index));
  const add = () =>
    onUpdate([
      ...entries,
      {
        fact: "",
        summary: "",
        tags: ["event"],
        createdAt: todayIso(),
        establishedAt: todayIso(),
        lastConfirmedAt: todayIso(),
        superseded: false,
      },
    ]);

  const restoreArchivedAt = (archivedIndex: number) => {
    const fact = archived[archivedIndex];
    if (!fact) return;
    const globalIdx = entries.indexOf(fact);
    if (globalIdx >= 0) {
      updateAt(globalIdx, {
        superseded: false,
        lastConfirmedAt: todayIso(),
        supersededBy: undefined,
      });
    }
  };

  return (
    <SectionShell title="Hard Facts" badge={`${active.length}`}>
      {active.map((fact) => {
        const idx = entries.indexOf(fact);
        return (
          <EntityCard
            key={`${fact.fact}-${idx}`}
            label={fact.fact || "(new fact)"}
            onRemove={() => removeAt(idx)}
          >
            <DeferredTextarea
              value={fact.fact}
              onCommit={(val) => updateAt(idx, { fact: val })}
              placeholder="Hard fact..."
              className="min-h-10 font-mono text-[11px] leading-relaxed"
              rows={2}
            />
            <DeferredInput
              value={fact.summary ?? ""}
              onCommit={(val) => updateAt(idx, { summary: val || undefined })}
              placeholder="Summary label"
              className="h-7 text-[11px]"
            />
            <DeferredInput
              value={(fact.tags ?? []).join(", ")}
              onCommit={(val) =>
                updateAt(idx, {
                  tags: parseFactTags(val),
                })
              }
              placeholder="Tags (biographical, spatial, relational, temporal, world, event)"
              className="h-7 text-[11px]"
            />
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>est {fact.establishedAt ?? fact.createdAt ?? "-"}</span>
              <span>confirmed {fact.lastConfirmedAt ?? "-"}</span>
            </div>
            <DeferredInput
              value={fact.supersededBy ?? ""}
              onCommit={(val) =>
                updateAt(idx, { supersededBy: val.trim() || undefined })
              }
              placeholder="Superseded by (optional rationale)"
              className="h-7 text-[11px]"
            />
            {fact.lifecycleRejection && (
              <div className="rounded bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-400">
                <span className="font-medium">Removal blocked: </span>
                {fact.lifecycleRejection}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 self-start text-[10px]"
              onClick={() =>
                updateAt(idx, {
                  superseded: true,
                  supersededBy:
                    fact.supersededBy ?? `Manually superseded on ${todayIso()}`,
                })
              }
            >
              Supersede
            </Button>
          </EntityCard>
        );
      })}
      {archived.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 self-start text-[10px]"
          onClick={() => setArchiveOpen(true)}
        >
          Superseded Archive ({archived.length})
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add fact
      </Button>
      <ArchivedFactsModal
        facts={archived}
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onRestore={restoreArchivedAt}
      />
    </SectionShell>
  );
}
