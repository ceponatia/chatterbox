"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type {
  Entity,
  Relationship,
  RelationshipTone,
} from "@chatterbox/state-model";
import { resolveEntityName, findOrCreateEntity } from "@chatterbox/state-model";
import { DeferredTextarea } from "./deferred-inputs";
import {
  EntityCard,
  EntitySelect,
  keyedByBase,
  SectionShell,
} from "./section-primitives";

const RELATIONSHIP_TONES: RelationshipTone[] = [
  "hostile",
  "cold",
  "neutral",
  "warm",
  "close",
  "intimate",
];

function RelationshipCard({
  rel,
  index,
  entities,
  onUpdate,
  onEntitiesUpdate,
  onRemove,
}: {
  rel: Relationship;
  index: number;
  entities: Entity[];
  onUpdate: (i: number, patch: Partial<Relationship>) => void;
  onEntitiesUpdate: (entities: Entity[]) => void;
  onRemove: () => void;
}) {
  const fromName = resolveEntityName(entities, rel.fromEntityId);
  const toName = resolveEntityName(entities, rel.toEntityId);

  return (
    <EntityCard
      label={`${fromName || "?"} → ${toName || "?"}`}
      onRemove={onRemove}
    >
      <div className="flex gap-1.5">
        <EntitySelect
          entityId={rel.fromEntityId}
          entities={entities}
          onChange={(id) => onUpdate(index, { fromEntityId: id })}
          onCreateNew={(name) => {
            const updated = [...entities];
            const entity = findOrCreateEntity(updated, name);
            onEntitiesUpdate(updated);
            onUpdate(index, { fromEntityId: entity.id });
          }}
          placeholder="From"
        />
        <span className="self-center text-[11px] text-muted-foreground">→</span>
        <EntitySelect
          entityId={rel.toEntityId}
          entities={entities}
          onChange={(id) => onUpdate(index, { toEntityId: id })}
          onCreateNew={(name) => {
            const updated = [...entities];
            const entity = findOrCreateEntity(updated, name);
            onEntitiesUpdate(updated);
            onUpdate(index, { toEntityId: entity.id });
          }}
          placeholder="To"
        />
      </div>
      <DeferredTextarea
        value={rel.description}
        onCommit={(val) => onUpdate(index, { description: val })}
        placeholder="Relationship description..."
        className="min-h-12 font-mono text-[11px] leading-relaxed"
        rows={2}
      />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground">Tone</label>
        <select
          className="app-editor-select h-7"
          value={rel.tone ?? "neutral"}
          onChange={(e) =>
            onUpdate(index, { tone: e.target.value as RelationshipTone })
          }
        >
          {RELATIONSHIP_TONES.map((tone) => (
            <option key={tone} value={tone}>
              {tone}
            </option>
          ))}
        </select>
      </div>
      {rel.details.length > 0 && (
        <div className="app-editor-sublist">
          {rel.details.map((d, di) => (
            <div key={di} className="flex gap-1 items-start">
              <span className="text-[10px] text-muted-foreground mt-1">•</span>
              <DeferredTextarea
                value={d}
                onCommit={(val) => {
                  const newDetails = [...rel.details];
                  newDetails[di] = val;
                  onUpdate(index, { details: newDetails });
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
          <RelationshipCard
            key={stableKey}
            rel={r}
            index={i}
            entities={entities}
            onUpdate={update}
            onEntitiesUpdate={onEntitiesUpdate}
            onRemove={() => remove(i)}
          />
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="app-editor-add-button"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> Add relationship
      </Button>
    </SectionShell>
  );
}
