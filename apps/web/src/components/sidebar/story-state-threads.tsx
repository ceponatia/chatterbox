"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import type { StoryThread } from "@chatterbox/state-model";
import { DeferredInput, DeferredTextarea } from "./deferred-inputs";
import { EntityCard, SectionShell } from "./section-primitives";
import { ArchivedThreadsModal } from "./archive-detail-modal";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ThreadCard({
  thread,
  onUpdate,
  onRemove,
}: {
  thread: StoryThread;
  onUpdate: (patch: Partial<StoryThread>) => void;
  onRemove: () => void;
}) {
  return (
    <EntityCard
      label={thread.description || "(new thread)"}
      badge={
        <Badge variant="outline" className="text-[9px] px-1 py-0">
          {thread.status}
        </Badge>
      }
      onRemove={onRemove}
    >
      <DeferredTextarea
        value={thread.description}
        onCommit={(val) => onUpdate({ description: val })}
        placeholder="Thread description..."
        className="min-h-10 font-mono text-[11px] leading-relaxed"
        rows={2}
      />
      <DeferredInput
        value={thread.hook ?? ""}
        onCommit={(val) => onUpdate({ hook: val })}
        placeholder="Thread hook (short evocative label)"
        className="h-7 text-[11px]"
      />
      <DeferredInput
        value={thread.resolutionHint}
        onCommit={(val) => onUpdate({ resolutionHint: val })}
        placeholder="Resolution hint (what would resolve this?)"
        className="h-7 text-[11px]"
      />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground">Status</label>
        <select
          className="app-editor-select h-7"
          value={thread.status}
          onChange={(e) =>
            onUpdate({
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
        <div className="app-editor-warning">
          <span className="font-medium">Removal blocked: </span>
          {thread.lifecycleRejection}
        </div>
      )}
    </EntityCard>
  );
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
        <ThreadCard
          key={thread.id}
          thread={thread}
          onUpdate={(patch) => updateById(thread.id, patch)}
          onRemove={() => removeById(thread.id)}
        />
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
        className="app-editor-add-button"
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
