"use client";

import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import type { CustomSection } from "@/lib/story-state-model";
import { DeferredTextarea } from "./deferred-inputs";
import { SectionShell } from "./section-primitives";

function keyByText(items: string[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = item.trim() || "empty";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${base}-${count}`;
  });
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

  const keys = keyByText(items);

  return (
    <SectionShell title={title} badge={`${items.length}`}>
      {items.map((item, i) => (
        <div key={keys[i]} className="flex gap-1.5 items-start">
          <DeferredTextarea
            value={item}
            onCommit={(val) => update(i, val)}
            placeholder={placeholder}
            className="min-h-8 font-mono text-[11px] leading-relaxed flex-1"
            rows={1}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="relative mt-1 text-muted-foreground hover:text-destructive before:absolute before:-inset-2 before:content-['']"
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="app-editor-add-button"
        onClick={add}
      >
        <Plus className="mr-1 h-3 w-3" /> {addLabel}
      </Button>
    </SectionShell>
  );
}

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

function keyByTimestamp(items: TimestampedItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = `${item.createdAt ?? ""}-${item.text.trim() || "empty"}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${base}-${count}`;
  });
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
      {
        text: "",
        createdAt: new Date().toISOString().slice(0, 10),
      },
    ]);
  const remove = (origIdx: number) =>
    onUpdate(items.filter((_, idx) => idx !== origIdx));

  const keys = keyByTimestamp(items);

  return (
    <SectionShell title={title} badge={`${items.length}`}>
      {sorted.map(({ item, origIdx }) => (
        <div key={keys[origIdx]} className="flex flex-col gap-0.5">
          <div className="flex gap-1.5 items-start">
            <DeferredTextarea
              value={item.text}
              onCommit={(val) => updateText(origIdx, val)}
              placeholder={placeholder}
              className="min-h-8 font-mono text-[11px] leading-relaxed flex-1"
              rows={1}
            />
            <button
              type="button"
              onClick={() => remove(origIdx)}
              className="relative mt-1 text-muted-foreground hover:text-destructive before:absolute before:-inset-2 before:content-['']"
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
        className="app-editor-add-button"
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
      <DeferredTextarea
        value={section.content}
        onCommit={onUpdate}
        className="min-h-16 font-mono text-[11px] leading-relaxed"
        rows={Math.min(lineCount + 1, 10)}
      />
    </SectionShell>
  );
}
