"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { HardFact, FactTag } from "@chatterbox/state-model";
import { DeferredInput, DeferredTextarea } from "./deferred-inputs";
import { EntityCard, SectionShell } from "./section-primitives";
import { Plus } from "lucide-react";
import { ArchivedFactsModal } from "./archive-detail-modal";

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

function FactCard({
  fact,
  index,
  onUpdate,
  onRemove,
}: {
  fact: HardFact;
  index: number;
  onUpdate: (index: number, patch: Partial<HardFact>) => void;
  onRemove: () => void;
}) {
  return (
    <EntityCard label={fact.fact || "(new fact)"} onRemove={onRemove}>
      <DeferredTextarea
        value={fact.fact}
        onCommit={(val) => onUpdate(index, { fact: val })}
        placeholder="Hard fact..."
        className="min-h-10 font-mono text-[11px] leading-relaxed"
        rows={2}
      />
      <DeferredInput
        value={fact.summary ?? ""}
        onCommit={(val) => onUpdate(index, { summary: val || undefined })}
        placeholder="Summary label"
        className="h-7 text-[11px]"
      />
      <DeferredInput
        value={(fact.tags ?? []).join(", ")}
        onCommit={(val) =>
          onUpdate(index, {
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
          onUpdate(index, { supersededBy: val.trim() || undefined })
        }
        placeholder="Superseded by (optional rationale)"
        className="h-7 text-[11px]"
      />
      {fact.lifecycleRejection && (
        <div className="app-editor-warning">
          <span className="font-medium">Removal blocked: </span>
          {fact.lifecycleRejection}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 self-start text-[10px]"
        onClick={() =>
          onUpdate(index, {
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
          <FactCard
            key={`${fact.fact}-${idx}`}
            fact={fact}
            index={idx}
            onUpdate={updateAt}
            onRemove={() => removeAt(idx)}
          />
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
        className="app-editor-add-button"
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
