"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParsedCharacterMarkdown } from "@/lib/character-markdown-parser";
import type { CharacterBuilderDraft } from "./use-character-builder";

export interface ImportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsed: ParsedCharacterMarkdown;
  existingDraft: CharacterBuilderDraft;
  onAccept: (selectedSections: Set<string>) => void;
}

const SECTION_DEFS: Array<{
  key: string;
  label: string;
  summarize: (parsed: ParsedCharacterMarkdown) => string | null;
  hasExisting: (draft: CharacterBuilderDraft) => boolean;
}> = [
  {
    key: "identity",
    label: "Identity",
    summarize: (p) => {
      if (!p.identity) return null;
      const parts = [
        p.identity.age && `age: ${p.identity.age}`,
        p.identity.pronouns && `pronouns: ${p.identity.pronouns}`,
        p.identity.species && `species: ${p.identity.species}`,
        p.identity.role && `role: ${p.identity.role}`,
        p.identity.situation && `situation: ${truncate(p.identity.situation)}`,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    },
    hasExisting: (d) => Object.values(d.identity).some((v) => v.length > 0),
  },
  {
    key: "background",
    label: "Background",
    summarize: (p) => (p.background ? truncate(p.background) : null),
    hasExisting: (d) => d.background.length > 0,
  },
  {
    key: "appearance",
    label: "Appearance",
    summarize: (p) => {
      if (!p.appearance || p.appearance.length === 0) return null;
      return `${p.appearance.length} attribute${p.appearance.length === 1 ? "" : "s"}: ${p.appearance.map((a) => a.attribute).join(", ")}`;
    },
    hasExisting: (d) =>
      d.appearance.some((a) => a.attribute.length > 0 && a.value.length > 0),
  },
  {
    key: "behavioralProfile",
    label: "Behavioral Profile",
    summarize: (p) => {
      if (!p.behavioralProfile) return null;
      const filled = Object.entries(p.behavioralProfile).filter(
        ([, v]) => v.length > 0,
      );
      return `${filled.length} field${filled.length === 1 ? "" : "s"}: ${filled.map(([k]) => k).join(", ")}`;
    },
    hasExisting: (d) =>
      Object.values(d.behavioralProfile).some((v) => v.length > 0),
  },
  {
    key: "startingDemeanor",
    label: "Starting Demeanor",
    summarize: (p) =>
      p.startingDemeanor ? truncate(p.startingDemeanor) : null,
    hasExisting: (d) => d.startingDemeanor.length > 0,
  },
];

function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "...";
}

export function ImportPreviewModal({
  open,
  onOpenChange,
  parsed,
  existingDraft,
  onAccept,
}: ImportPreviewProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const def of SECTION_DEFS) {
      if (def.summarize(parsed) !== null) {
        initial.add(def.key);
      }
    }
    return initial;
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const parsedSections = SECTION_DEFS.filter(
    (def) => def.summarize(parsed) !== null,
  );
  const unparsedSections = parsed.unparsed;
  const hasSelections = selected.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Preview</DialogTitle>
          <DialogDescription>
            Review parsed sections before applying them to the form.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {parsedSections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No structured sections were parsed from the imported markdown.
            </p>
          )}

          {parsedSections.map((def) => {
            const summary = def.summarize(parsed);
            const isSelected = selected.has(def.key);
            const willOverwrite = def.hasExisting(existingDraft);

            return (
              <button
                key={def.key}
                type="button"
                onClick={() => toggle(def.key)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-transparent opacity-60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <span className="text-sm font-medium">{def.label}</span>
                  {willOverwrite && isSelected && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-400">
                      <AlertTriangle className="h-3 w-3" />
                      Will overwrite
                    </span>
                  )}
                </div>
                {summary && (
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                    {summary}
                  </p>
                )}
              </button>
            );
          })}

          {unparsedSections.length > 0 && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
              <p className="text-xs font-medium text-yellow-400">
                Unparsed sections ({unparsedSections.length})
              </p>
              <ul className="mt-1 space-y-0.5 pl-2 text-xs text-muted-foreground">
                {unparsedSections.map((raw, i) => {
                  const heading =
                    raw.match(/^##\s+(.+)$/m)?.[1] ?? raw.slice(0, 60);
                  return (
                    <li key={i} className="truncate">
                      {heading}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!hasSelections} onClick={() => onAccept(selected)}>
            Apply Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
