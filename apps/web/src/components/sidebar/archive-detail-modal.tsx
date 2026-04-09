"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { StoryThread, HardFact } from "@chatterbox/state-model";

// ---------------------------------------------------------------------------
// Shared expandable row
// ---------------------------------------------------------------------------

function ExpandableRow({
  label,
  badge,
  children,
}: {
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-editor-section">
      <button
        type="button"
        className="app-editor-section-trigger text-[11px]"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {badge}
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <div className="app-editor-section-body gap-1.5 text-[11px] text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archived Threads Modal
// ---------------------------------------------------------------------------

interface ArchivedThreadsModalProps {
  threads: StoryThread[];
  open: boolean;
  onClose: () => void;
  onRestore: (id: string) => void;
}

function ArchiveModalShell({
  open,
  onClose,
  title,
  description,
  emptyMessage,
  count,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  emptyMessage: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {title} ({count})
          </DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {count === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            children
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArchivedThreadRow({
  thread,
  onRestore,
}: {
  thread: StoryThread;
  onRestore: (id: string) => void;
}) {
  return (
    <ExpandableRow
      label={thread.description || "(unnamed thread)"}
      badge={
        <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
          {thread.status}
        </Badge>
      }
    >
      <div className="flex flex-col gap-1">
        <div>
          <span className="font-medium text-foreground/70">Description: </span>
          {thread.description}
        </div>
        {thread.hook && (
          <div>
            <span className="font-medium text-foreground/70">Hook: </span>
            {thread.hook}
          </div>
        )}
        {thread.resolutionHint && (
          <div>
            <span className="font-medium text-foreground/70">
              Resolution hint:{" "}
            </span>
            {thread.resolutionHint}
          </div>
        )}
        {thread.closureRationale && (
          <div>
            <span className="font-medium text-foreground/70">
              Closure rationale:{" "}
            </span>
            {thread.closureRationale}
          </div>
        )}
        {thread.lifecycleRejection && (
          <div className="app-editor-warning">
            <span className="font-medium">Rejection: </span>
            {thread.lifecycleRejection}
          </div>
        )}
        {thread.evolvedInto && (
          <div>
            <span className="font-medium text-foreground/70">
              Evolved into:{" "}
            </span>
            {thread.evolvedInto}
          </div>
        )}
        <div className="flex items-center gap-3 text-[10px]">
          {thread.createdAt && <span>Created {thread.createdAt}</span>}
          {thread.lastReferencedAt && (
            <span>Last ref {thread.lastReferencedAt}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 self-start text-[10px]"
          onClick={() => onRestore(thread.id)}
        >
          Restore
        </Button>
      </div>
    </ExpandableRow>
  );
}

export function ArchivedThreadsModal({
  threads,
  open,
  onClose,
  onRestore,
}: ArchivedThreadsModalProps) {
  return (
    <ArchiveModalShell
      open={open}
      onClose={onClose}
      title="Archived Threads"
      description="Resolved and stale threads from the story."
      emptyMessage="No archived threads."
      count={threads.length}
    >
      {threads.map((thread) => (
        <ArchivedThreadRow
          key={thread.id}
          thread={thread}
          onRestore={onRestore}
        />
      ))}
    </ArchiveModalShell>
  );
}

// ---------------------------------------------------------------------------
// Archived Hard Facts Modal
// ---------------------------------------------------------------------------

interface ArchivedFactsModalProps {
  facts: HardFact[];
  open: boolean;
  onClose: () => void;
  onRestore: (index: number) => void;
}

function ArchivedFactRow({
  fact,
  index,
  onRestore,
}: {
  fact: HardFact;
  index: number;
  onRestore: (index: number) => void;
}) {
  return (
    <ExpandableRow
      label={fact.summary || fact.fact || "(unnamed fact)"}
      badge={
        fact.tags && fact.tags.length > 0 ? (
          <Badge
            variant="secondary"
            className="shrink-0 px-1 py-0 text-[9px] font-mono"
          >
            {fact.tags[0]}
          </Badge>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1">
        <div>
          <span className="font-medium text-foreground/70">Fact: </span>
          {fact.fact}
        </div>
        {fact.summary && (
          <div>
            <span className="font-medium text-foreground/70">Summary: </span>
            {fact.summary}
          </div>
        )}
        {fact.tags && fact.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground/70">Tags: </span>
            {fact.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="px-1 py-0 text-[9px]"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {fact.supersededBy && (
          <div>
            <span className="font-medium text-foreground/70">
              Superseded by:{" "}
            </span>
            {fact.supersededBy}
          </div>
        )}
        {fact.lifecycleRejection && (
          <div className="app-editor-warning">
            <span className="font-medium">Rejection: </span>
            {fact.lifecycleRejection}
          </div>
        )}
        <div className="flex items-center gap-3 text-[10px]">
          {fact.establishedAt && <span>Established {fact.establishedAt}</span>}
          {fact.lastConfirmedAt && (
            <span>Confirmed {fact.lastConfirmedAt}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 self-start text-[10px]"
          onClick={() => onRestore(index)}
        >
          Restore
        </Button>
      </div>
    </ExpandableRow>
  );
}

export function ArchivedFactsModal({
  facts,
  open,
  onClose,
  onRestore,
}: ArchivedFactsModalProps) {
  return (
    <ArchiveModalShell
      open={open}
      onClose={onClose}
      title="Superseded Facts"
      description="Hard facts that have been superseded by newer information."
      emptyMessage="No superseded facts."
      count={facts.length}
    >
      {facts.map((fact, index) => (
        <ArchivedFactRow
          key={`${fact.fact}-${index}`}
          fact={fact}
          index={index}
          onRestore={onRestore}
        />
      ))}
    </ArchiveModalShell>
  );
}
