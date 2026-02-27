"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, Trash2, User } from "lucide-react";
import type {
  StructuredStoryState, Entity, Relationship, AppearanceEntry,
  DemeanorEntry, CustomSection,
} from "@/lib/story-state-model";
import { resolveEntityName, findOrCreateEntity, findEntityByName } from "@/lib/story-state-model";

// ---------------------------------------------------------------------------
// Collapsible section wrapper (shared by all typed sections)
// ---------------------------------------------------------------------------

function SectionShell({
  title, badge, children, defaultExpanded = true,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <span className="flex-1 text-xs font-medium">{title}</span>
        {badge && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{badge}</Badge>
        )}
      </button>
      {expanded && <div className="border-t px-3 py-2 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity card (individual cast member, relationship, appearance entry, etc.)
// ---------------------------------------------------------------------------

function EntityCard({
  label, badge, onRemove, children,
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
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive" title="Remove">
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

export function EntitiesSection({ entities, onUpdate }: {
  entities: Entity[];
  onUpdate: (entities: Entity[]) => void;
}) {
  const update = (i: number, patch: Partial<Entity>) =>
    onUpdate(entities.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  const add = () => onUpdate([...entities, {
    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "", description: "", isPlayerCharacter: false,
  }]);
  const remove = (i: number) => onUpdate(entities.filter((_, idx) => idx !== i));

  return (
    <SectionShell title="Cast" badge={`${entities.length}`}>
      {entities.map((e, i) => (
        <EntityCard
          key={e.id}
          label={e.name || "(unnamed)"}
          badge={e.isPlayerCharacter ? <Badge variant="secondary" className="text-[9px] px-1 py-0"><User className="h-2.5 w-2.5 mr-0.5" />PC</Badge> : undefined}
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
      <Button variant="ghost" size="sm" className="self-start text-xs" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> Add cast member
      </Button>
    </SectionShell>
  );
}

function EntitySelect({ entityId, entities, onChange, placeholder }: {
  entityId: string;
  entities: Entity[];
  onChange: (entityId: string) => void;
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
        if (!match) {
          onChange(`__new__${typed}`);
        }
      }}
      placeholder={placeholder}
      className="h-7 text-[11px] flex-1"
      list="entity-names"
    />
  );
}

export function RelationshipsSection({ relationships, entities, onUpdate, onEntitiesUpdate }: {
  relationships: Relationship[];
  entities: Entity[];
  onUpdate: (rels: Relationship[]) => void;
  onEntitiesUpdate: (entities: Entity[]) => void;
}) {
  const resolveOrCreate = (idOrMarker: string): string => {
    if (!idOrMarker.startsWith("__new__")) return idOrMarker;
    const name = idOrMarker.slice(7);
    const updated = [...entities];
    const entity = findOrCreateEntity(updated, name);
    onEntitiesUpdate(updated);
    return entity.id;
  };

  const update = (i: number, patch: Partial<Relationship>) => {
    const resolved: Partial<Relationship> = { ...patch };
    if (patch.fromEntityId) resolved.fromEntityId = resolveOrCreate(patch.fromEntityId);
    if (patch.toEntityId) resolved.toEntityId = resolveOrCreate(patch.toEntityId);
    onUpdate(relationships.map((r, idx) => idx === i ? { ...r, ...resolved } : r));
  };

  const add = () => onUpdate([...relationships, { fromEntityId: "", toEntityId: "", description: "", details: [] }]);
  const remove = (i: number) => onUpdate(relationships.filter((_, idx) => idx !== i));

  return (
    <SectionShell title="Relationships" badge={`${relationships.length}`}>
      <datalist id="entity-names">
        {entities.map(e => <option key={e.id} value={e.name} />)}
      </datalist>
      {relationships.map((r, i) => {
        const fromName = resolveEntityName(entities, r.fromEntityId);
        const toName = resolveEntityName(entities, r.toEntityId);
        return (
          <EntityCard key={i} label={`${fromName || "?"} → ${toName || "?"}`} onRemove={() => remove(i)}>
            <div className="flex gap-1.5">
              <EntitySelect entityId={r.fromEntityId} entities={entities} onChange={(id) => update(i, { fromEntityId: id })} placeholder="From" />
              <span className="self-center text-[11px] text-muted-foreground">→</span>
              <EntitySelect entityId={r.toEntityId} entities={entities} onChange={(id) => update(i, { toEntityId: id })} placeholder="To" />
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
                  <div key={di} className="flex gap-1 items-start">
                    <span className="text-[10px] text-muted-foreground mt-1">•</span>
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
      <Button variant="ghost" size="sm" className="self-start text-xs" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> Add relationship
      </Button>
    </SectionShell>
  );
}

export function AppearanceSection({ entries, entities, onUpdate, onEntitiesUpdate }: {
  entries: AppearanceEntry[];
  entities: Entity[];
  onUpdate: (entries: AppearanceEntry[]) => void;
  onEntitiesUpdate: (entities: Entity[]) => void;
}) {
  const resolveOrCreate = (idOrMarker: string): string => {
    if (!idOrMarker.startsWith("__new__")) return idOrMarker;
    const name = idOrMarker.slice(7);
    const updated = [...entities];
    const entity = findOrCreateEntity(updated, name);
    onEntitiesUpdate(updated);
    return entity.id;
  };

  const update = (i: number, patch: Partial<AppearanceEntry>) => {
    const resolved: Partial<AppearanceEntry> = { ...patch };
    if (patch.entityId) resolved.entityId = resolveOrCreate(patch.entityId);
    onUpdate(entries.map((e, idx) => idx === i ? { ...e, ...resolved } : e));
  };

  const add = () => onUpdate([...entries, { entityId: entities[0]?.id ?? "", attribute: "", description: "" }]);
  const remove = (i: number) => onUpdate(entries.filter((_, idx) => idx !== i));

  return (
    <SectionShell title="Appearance" badge={`${entries.length}`}>
      {entries.map((e, i) => {
        const charName = resolveEntityName(entities, e.entityId);
        return (
          <EntityCard key={i} label={`${charName || "?"} — ${e.attribute || "?"}`} onRemove={() => remove(i)}>
            <div className="flex gap-1.5">
              <EntitySelect entityId={e.entityId} entities={entities} onChange={(id) => update(i, { entityId: id })} placeholder="Character" />
              <Input value={e.attribute} onChange={(ev) => update(i, { attribute: ev.target.value })} placeholder="Attribute" className="h-7 text-[11px] flex-1" />
            </div>
            <Textarea
              value={e.description}
              onChange={(ev) => update(i, { description: ev.target.value })}
              placeholder="Description..."
              className="min-h-12 font-mono text-[11px] leading-relaxed"
              rows={2}
            />
          </EntityCard>
        );
      })}
      <Button variant="ghost" size="sm" className="self-start text-xs" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> Add appearance entry
      </Button>
    </SectionShell>
  );
}

export function SceneSection({ scene, entities, onUpdate }: {
  scene: StructuredStoryState["scene"];
  entities: Entity[];
  onUpdate: (scene: StructuredStoryState["scene"]) => void;
}) {
  const presentNames = scene.presentEntityIds.map(id => resolveEntityName(entities, id));
  return (
    <SectionShell title="Scene">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">Where / When</label>
        <Input value={scene.location} onChange={(e) => onUpdate({ ...scene, location: e.target.value })} placeholder="Location and time..." className="h-7 text-[11px]" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">Who is present</label>
        <Input
          value={presentNames.join(", ")}
          onChange={(e) => {
            const names = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
            const ids = names.map(n => {
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
        <Input value={scene.atmosphere} onChange={(e) => onUpdate({ ...scene, atmosphere: e.target.value })} placeholder="Atmosphere..." className="h-7 text-[11px]" />
      </div>
    </SectionShell>
  );
}

export function DemeanorSection({ entries, entities, onUpdate, onEntitiesUpdate }: {
  entries: DemeanorEntry[];
  entities: Entity[];
  onUpdate: (entries: DemeanorEntry[]) => void;
  onEntitiesUpdate: (entities: Entity[]) => void;
}) {
  const resolveOrCreate = (idOrMarker: string): string => {
    if (!idOrMarker.startsWith("__new__")) return idOrMarker;
    const name = idOrMarker.slice(7);
    const updated = [...entities];
    const entity = findOrCreateEntity(updated, name);
    onEntitiesUpdate(updated);
    return entity.id;
  };

  const update = (i: number, patch: Partial<DemeanorEntry>) => {
    const resolved: Partial<DemeanorEntry> = { ...patch };
    if (patch.entityId) resolved.entityId = resolveOrCreate(patch.entityId);
    onUpdate(entries.map((e, idx) => idx === i ? { ...e, ...resolved } : e));
  };

  const add = () => onUpdate([...entries, { entityId: entities[0]?.id ?? "", mood: "", energy: "" }]);
  const remove = (i: number) => onUpdate(entries.filter((_, idx) => idx !== i));

  return (
    <SectionShell title="Current Demeanor" badge={`${entries.length}`}>
      {entries.map((e, i) => (
        <EntityCard key={i} label={resolveEntityName(entities, e.entityId) || "General"} onRemove={() => remove(i)}>
          <EntitySelect entityId={e.entityId} entities={entities} onChange={(id) => update(i, { entityId: id })} placeholder="Character" />
          <div className="flex gap-1.5">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Mood</label>
              <Input value={e.mood} onChange={(ev) => update(i, { mood: ev.target.value })} className="h-7 text-[11px]" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Energy</label>
              <Input value={e.energy} onChange={(ev) => update(i, { energy: ev.target.value })} className="h-7 text-[11px]" />
            </div>
          </div>
        </EntityCard>
      ))}
      <Button variant="ghost" size="sm" className="self-start text-xs" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> Add demeanor
      </Button>
    </SectionShell>
  );
}

export function BulletListSection({ title, items, onUpdate, placeholder, addLabel }: {
  title: string;
  items: string[];
  onUpdate: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  const update = (i: number, val: string) => onUpdate(items.map((item, idx) => idx === i ? val : item));
  const add = () => onUpdate([...items, ""]);
  const remove = (i: number) => onUpdate(items.filter((_, idx) => idx !== i));

  return (
    <SectionShell title={title} badge={`${items.length}`}>
      {items.map((item, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <Textarea
            value={item}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className="min-h-8 font-mono text-[11px] leading-relaxed flex-1"
            rows={1}
          />
          <button type="button" onClick={() => remove(i)} className="mt-1 text-muted-foreground hover:text-destructive" title="Remove">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="self-start text-xs" onClick={add}>
        <Plus className="mr-1 h-3 w-3" /> {addLabel}
      </Button>
    </SectionShell>
  );
}

export function CustomSectionEditor({ section, onUpdate }: {
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
