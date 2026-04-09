"use client";

import { useState, useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus, Trash2, User } from "lucide-react";
import type {
  Entity,
  AppearanceEntry,
  AttributeCategory,
} from "@chatterbox/state-model";
import { resolveEntityName } from "@chatterbox/state-model";
import { DeferredInput } from "./deferred-inputs";
import { keyedByBase, SectionShell } from "./section-primitives";

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

function splitTags(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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

function TagValueRow({
  tag,
  index,
  description,
  onDescriptionChange,
}: {
  tag: string;
  index: number;
  description: string;
  onDescriptionChange: (val: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-muted-foreground">•</span>
      <DeferredInput
        value={tag}
        onCommit={(val) =>
          onDescriptionChange(updateTagAtIndex(description, index, val))
        }
        className="h-5 text-[10px] flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
      <button
        type="button"
        onClick={() =>
          onDescriptionChange(removeTagAtIndex(description, index))
        }
        className="relative text-muted-foreground hover:text-destructive shrink-0 before:absolute before:-inset-2 before:content-['']"
        title="Remove value"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </button>
    </div>
  );
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
    <div className="app-editor-card gap-0 px-0 py-0">
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
          className="app-editor-select h-5 px-1 text-[9px]"
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
              <TagValueRow
                key={ti}
                tag={tag}
                index={ti}
                description={description}
                onDescriptionChange={onDescriptionChange}
              />
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
            <div className="app-editor-sublist">
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
        className="app-editor-add-button"
        onClick={addNew}
      >
        <Plus className="mr-1 h-3 w-3" /> Add character entry
      </Button>
    </SectionShell>
  );
}
