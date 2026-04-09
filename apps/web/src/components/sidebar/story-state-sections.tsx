"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, User } from "lucide-react";
import type {
  StructuredStoryState,
  Entity,
  DemeanorEntry,
} from "@chatterbox/state-model";
import { resolveEntityName, findOrCreateEntity } from "@chatterbox/state-model";
import { DeferredInput, DeferredTextarea } from "./deferred-inputs";
import {
  EntityCard,
  EntitySelect,
  keyedByBase,
  SectionShell,
} from "./section-primitives";
export {
  BulletListSection,
  TimestampedBulletListSection,
  CustomSectionEditor,
} from "./bullet-list-sections";
export { RelationshipsSection } from "./story-state-relationships";
export { CharactersSection } from "./story-state-appearance";
export { OpenThreadsSection } from "./story-state-threads";
export { HardFactsSection } from "./story-state-facts";

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
        className="app-editor-add-button"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add cast member
      </Button>
    </SectionShell>
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
        className="app-editor-add-button"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add demeanor
      </Button>
    </SectionShell>
  );
}
