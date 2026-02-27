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
import type { StoryThread, HardFact } from "@/lib/story-state-model";

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
    <div className="rounded border border-border/50 bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-muted/60"
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
        <div className="flex flex-col gap-1.5 border-t border-border/30 px-3 py-2 text-[11px] text-muted-foreground">
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

export function ArchivedThreadsModal({
  threads,
  open,
  onClose,
  onRestore,
}: ArchivedThreadsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Archived Threads ({threads.length})
          </DialogTitle>
          <DialogDescription className="text-xs">
            Resolved and stale threads from the story.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {threads.map((thread) => (
            <ExpandableRow
              key={thread.id}
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
                    <span className="font-medium text-foreground/70">Resolution hint: </span>
                    {thread.resolutionHint}
                  </div>
                )}
                {thread.closureRationale && (
                  <div>
                    <span className="font-medium text-foreground/70">Closure rationale: </span>
                    {thread.closureRationale}
                  </div>
                )}
                {thread.lifecycleRejection && (
                  <div className="rounded bg-yellow-500/10 px-2 py-1 text-yellow-400">
                    <span className="font-medium">Rejection: </span>
                    {thread.lifecycleRejection}
                  </div>
                )}
                {thread.evolvedInto && (
                  <div>
                    <span className="font-medium text-foreground/70">Evolved into: </span>
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
          ))}
          {threads.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No archived threads.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
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

export function ArchivedFactsModal({
  facts,
  open,
  onClose,
  onRestore,
}: ArchivedFactsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Superseded Facts ({facts.length})
          </DialogTitle>
          <DialogDescription className="text-xs">
            Hard facts that have been superseded by newer information.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {facts.map((fact, i) => (
            <ExpandableRow
              key={`${fact.fact}-${i}`}
              label={fact.summary || fact.fact || "(unnamed fact)"}
              badge={
                fact.tags && fact.tags.length > 0 ? (
                  <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[9px] font-mono">
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
                    <span className="font-medium text-foreground/70">Superseded by: </span>
                    {fact.supersededBy}
                  </div>
                )}
                {fact.lifecycleRejection && (
                  <div className="rounded bg-yellow-500/10 px-2 py-1 text-yellow-400">
                    <span className="font-medium">Rejection: </span>
                    {fact.lifecycleRejection}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[10px]">
                  {fact.establishedAt && (
                    <span>Established {fact.establishedAt}</span>
                  )}
                  {fact.lastConfirmedAt && (
                    <span>Confirmed {fact.lastConfirmedAt}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 self-start text-[10px]"
                  onClick={() => onRestore(i)}
                >
                  Restore
                </Button>
              </div>
            </ExpandableRow>
          ))}
          {facts.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No superseded facts.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
