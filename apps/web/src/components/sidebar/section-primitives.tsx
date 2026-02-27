"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { Entity } from "@/lib/story-state-model";
import { findEntityByName, resolveEntityName } from "@/lib/story-state-model";

export function keyedByBase<T>(
  items: T[],
  getBase: (item: T) => string,
): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = getBase(item);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${base}-${count}`;
  });
}

export function SectionShell({
  title,
  badge,
  children,
  defaultExpanded = true,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
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
        className="relative flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 before:absolute before:-inset-2 before:content-['']"
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

export function EntityCard({
  label,
  badge,
  onRemove,
  children,
}: {
  label: string;
  badge?: ReactNode;
  onRemove?: () => void;
  children: ReactNode;
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

export function EntitySelect({
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
  const externalName = resolveEntityName(entities, entityId);
  const [localValue, setLocalValue] = useState(externalName);
  const [prevName, setPrevName] = useState(externalName);

  if (prevName !== externalName) {
    setPrevName(externalName);
    setLocalValue(externalName);
  }

  return (
    <Input
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        const typed = localValue.trim();
        if (!typed) return;
        const match = findEntityByName(entities, typed);
        if (match) {
          onChange(match.id);
        } else if (onCreateNew) {
          onCreateNew(typed);
        } else {
          onChange(typed);
        }
      }}
      placeholder={placeholder}
      className="h-7 text-[11px] flex-1"
      list="entity-names"
    />
  );
}
