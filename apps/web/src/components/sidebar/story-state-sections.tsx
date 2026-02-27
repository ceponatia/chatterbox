"use client";

import { useState, useId, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, Trash2, User } from "lucide-react";
import type {
  StructuredStoryState,
  Entity,
  Relationship,
  AppearanceEntry,
  DemeanorEntry,
  CustomSection,
} from "@/lib/story-state-model";
import {
  resolveEntityName,
  findOrCreateEntity,
  findEntityByName,
} from "@/lib/story-state-model";

// ---------------------------------------------------------------------------
// Collapsible section wrapper (shared by all typed sections)
// ---------------------------------------------------------------------------

function SectionShell({
  title,
  badge,
  children,
  defaultExpanded = true,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const uid = useId();
  const sectionId = `section-${uid}`;
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={sectionId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-xs font-medium">{title}</span>
        {badge && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {badge}
          </Badge>
        )}
      </button>
      {expanded && (
        <div id={sectionId} className="border-t px-3 py-2 flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity card (individual cast member, relationship, appearance entry, etc.)
// ---------------------------------------------------------------------------

function EntityCard({
  label,
  badge,
  onRemove,
  children,
}: {
  label: string;
  badge?: React.ReactNode;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border bg-muted/30 px-2.5 py-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[11px] font-medium truncate">{label}</span>
        {badge}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="relative text-muted-foreground hover:text-destructive before:absolute before:-inset-2 before:content-['']"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

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
          <Input
            value={e.name}
            onChange={(ev) => update(i, { name: ev.target.value })}
            placeholder="Character name"
            className="h-7 text-[11px]"
          />
          <Textarea
            value={e.description}
            onChange={(ev) => update(i, { description: ev.target.value })}
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

function EntitySelect({
  entityId,
  entities,
  onChange,
  onCreateNew,
  placeholder,
}: {
  entityId: string;
  entities: Entity[];
  onChange: (entityId: string) => void;
  onCreateNew?: (name: string) => void;
  placeholder: string;
}) {
  const name = resolveEntityName(entities, entityId);
  return (
    <Input
      value={name}
      onChange={(e) => {
        const typed = e.target.value;
        const match = findEntityByName(entities, typed);
        if (match) {
          onChange(match.id);
        } else {
          onChange(typed);
        }
      }}
      onBlur={(e) => {
        const typed = e.target.value.trim();
        if (!typed) return;
        const match = findEntityByName(entities, typed);
        if (!match && onCreateNew) onCreateNew(typed);
      }}
      placeholder={placeholder}
      className="h-7 text-[11px] flex-1"
      list="entity-names"
    />
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
      { fromEntityId: "", toEntityId: "", description: "", details: [] },
    ]);
  const remove = (i: number) =>
    onUpdate(relationships.filter((_, idx) => idx !== i));

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
        const stableKey =
          r.fromEntityId && r.toEntityId
            ? `${r.fromEntityId}-${r.toEntityId}`
            : String(i);
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
            <Textarea
              value={r.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="Relationship description..."
              className="min-h-12 font-mono text-[11px] leading-relaxed"
              rows={2}
            />
            {r.details.length > 0 && (
              <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted">
                {r.details.map((d, di) => (
                  <div
                    key={d.slice(0, 20) + di}
                    className="flex gap-1 items-start"
                  >
                    <span className="text-[10px] text-muted-foreground mt-1">
                      •
                    </span>
                    <Textarea
                      value={d}
                      onChange={(e) => {
                        const newDetails = [...r.details];
                        newDetails[di] = e.target.value;
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
    onUpdate([...entries, { entityId, attribute: "", description: "" }]);
  const addNew = () =>
    onUpdate([
      ...entries,
      { entityId: entities[0]?.id ?? "", attribute: "", description: "" },
    ]);
  const remove = (i: number) => onUpdate(entries.filter((_, idx) => idx !== i));

  const grouped = useMemo(() => groupByEntity(entries), [entries]);

  return (
    <SectionShell title="Characters" badge={`${entries.length}`}>
      {[...grouped.entries()].map(([entityId, items]) => {
        const charName = resolveEntityName(entities, entityId);
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
                className="ml-auto h-5 px-1 text-[10px]"
                onClick={() => addForEntity(entityId)}
              >
                <Plus className="h-2.5 w-2.5" />
              </Button>
            </div>
            <div className="text-[10px] font-medium text-muted-foreground px-1 pt-0.5">
              Appearance
            </div>
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted">
              {items.map(({ entry: e, origIdx }) => (
                <AppearanceAttributeRow
                  key={e.attribute + origIdx}
                  attribute={e.attribute}
                  description={e.description}
                  onAttributeChange={(val) =>
                    update(origIdx, { attribute: val })
                  }
                  onDescriptionChange={(val) =>
                    update(origIdx, { description: val })
                  }
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
  onAttributeChange,
  onDescriptionChange,
  onRemove,
}: {
  attribute: string;
  description: string;
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
        <Input
          value={attribute}
          onChange={(e) => onAttributeChange(e.target.value)}
          placeholder="Attribute (e.g. eyes, hair, outfit)"
          className="h-5 text-[11px] font-medium flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
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
                <Input
                  value={tag}
                  onChange={(e) =>
                    onDescriptionChange(
                      updateTagAtIndex(description, ti, e.target.value),
                    )
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
              className="self-start h-5 px-1 text-[9px]"
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
  return (
    <SectionShell title="Scene">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">
          Where / When
        </label>
        <Input
          value={scene.location}
          onChange={(e) => onUpdate({ ...scene, location: e.target.value })}
          placeholder="Location and time..."
          className="h-7 text-[11px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">
          Who is present
        </label>
        <Input
          value={presentNames.join(", ")}
          onChange={(e) => {
            const names = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const ids = names.map((n) => {
              const match = findEntityByName(entities, n);
              return match ? match.id : n;
            });
            onUpdate({ ...scene, presentEntityIds: ids });
          }}
          placeholder="Character names, comma-separated..."
          className="h-7 text-[11px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">Atmosphere</label>
        <Input
          value={scene.atmosphere}
          onChange={(e) => onUpdate({ ...scene, atmosphere: e.target.value })}
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

  return (
    <SectionShell title="Current Demeanor" badge={`${entries.length}`}>
      {entries.map((e, i) => (
        <EntityCard
          key={e.entityId || String(i)}
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
              <Input
                value={e.mood}
                onChange={(ev) => update(i, { mood: ev.target.value })}
                className="h-7 text-[11px]"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">
                Energy
              </label>
              <Input
                value={e.energy}
                onChange={(ev) => update(i, { energy: ev.target.value })}
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

export function BulletListSection({
  title,
  items,
  onUpdate,
  placeholder,
  addLabel,
}: {
  title: string;
  items: string[];
  onUpdate: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  const update = (i: number, val: string) =>
    onUpdate(items.map((item, idx) => (idx === i ? val : item)));
  const add = () => onUpdate([...items, ""]);
  const remove = (i: number) => onUpdate(items.filter((_, idx) => idx !== i));

  return (
    <SectionShell title={title} badge={`${items.length}`}>
      {items.map((item, i) => (
        <div key={item.slice(0, 20) + i} className="flex gap-1.5 items-start">
          <Textarea
            value={item}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className="min-h-8 font-mono text-[11px] leading-relaxed flex-1"
            rows={1}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="mt-1 text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> {addLabel}
      </Button>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Timestamped bullet list (Open Threads / Hard Facts) — sorted oldest-first
// ---------------------------------------------------------------------------

export interface TimestampedItem {
  text: string;
  createdAt?: string;
}

function formatDateBadge(iso?: string): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function byTimestamp(a: TimestampedItem, b: TimestampedItem): number {
  const da = a.createdAt ?? "";
  const db = b.createdAt ?? "";
  return da.localeCompare(db);
}

export function TimestampedBulletListSection({
  title,
  items,
  onUpdate,
  placeholder,
  addLabel,
}: {
  title: string;
  items: TimestampedItem[];
  onUpdate: (items: TimestampedItem[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  // Display sorted but preserve original indices for editing
  const indexed = items.map((item, i) => ({ item, origIdx: i }));
  const sorted = [...indexed].sort((a, b) => byTimestamp(a.item, b.item));

  const updateText = (origIdx: number, val: string) =>
    onUpdate(
      items.map((item, idx) =>
        idx === origIdx ? { ...item, text: val } : item,
      ),
    );
  const add = () =>
    onUpdate([
      ...items,
      { text: "", createdAt: new Date().toISOString().slice(0, 10) },
    ]);
  const remove = (origIdx: number) =>
    onUpdate(items.filter((_, idx) => idx !== origIdx));

  return (
    <SectionShell title={title} badge={`${items.length}`}>
      {sorted.map(({ item, origIdx }) => (
        <div
          key={item.createdAt ?? item.text.slice(0, 20)}
          className="flex flex-col gap-0.5"
        >
          <div className="flex gap-1.5 items-start">
            <Textarea
              value={item.text}
              onChange={(e) => updateText(origIdx, e.target.value)}
              placeholder={placeholder}
              className="min-h-8 font-mono text-[11px] leading-relaxed flex-1"
              rows={1}
            />
            <button
              type="button"
              onClick={() => remove(origIdx)}
              className="mt-1 text-muted-foreground hover:text-destructive"
              title="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <span className="text-[9px] text-muted-foreground pl-1">
            added {formatDateBadge(item.createdAt)}
          </span>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> {addLabel}
      </Button>
    </SectionShell>
  );
}

export function CustomSectionEditor({
  section,
  onUpdate,
}: {
  section: CustomSection;
  onUpdate: (content: string) => void;
}) {
  const lineCount = section.content.split("\n").length;
  return (
    <SectionShell title={section.heading} badge={`${lineCount} lines`}>
      <Textarea
        value={section.content}
        onChange={(e) => onUpdate(e.target.value)}
        className="min-h-16 font-mono text-[11px] leading-relaxed"
        rows={Math.min(lineCount + 1, 10)}
      />
    </SectionShell>
  );
}
