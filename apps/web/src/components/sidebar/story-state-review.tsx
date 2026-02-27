"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeftRight } from "lucide-react";
import { computeLineDiff, segmentDiff, mergeWithDecisions, type HunkDecision } from "@/lib/diff";
import { DiffView } from "./diff-view";
import { ReviewActions } from "./review-actions";

export interface StoryStateReviewProps {
  proposedStoryState: string;
  currentStoryState: string;
  isGenerating: boolean;
  onAccept: (storyState: string) => void;
  onReject: () => void;
}

export function StoryStateReview({
  proposedStoryState, currentStoryState, isGenerating, onAccept, onReject,
}: StoryStateReviewProps) {
  const [editing, setEditing] = useState(false);
  const [editedState, setEditedState] = useState(proposedStoryState);
  const [showDiff, setShowDiff] = useState(true);
  const [decisions, setDecisions] = useState<Record<number, HunkDecision>>({});

  if (!editing && editedState !== proposedStoryState) setEditedState(proposedStoryState);

  const diffLines = useMemo(() => computeLineDiff(currentStoryState, proposedStoryState), [currentStoryState, proposedStoryState]);
  const segments = useMemo(() => segmentDiff(diffLines), [diffLines]);
  const hunkIds = useMemo(() => segments.filter((s) => s.kind === "hunk").map((s) => (s as { id: number }).id), [segments]);

  const pendingCount = hunkIds.length - Object.keys(decisions).length;
  const allResolved = pendingCount === 0 && hunkIds.length > 0;

  const handleDecide = useCallback((hunkId: number, decision: HunkDecision) => {
    setDecisions((prev) => ({ ...prev, [hunkId]: decision }));
  }, []);

  const setAllDecisions = useCallback((value: HunkDecision) => {
    const all: Record<number, HunkDecision> = {};
    for (const id of hunkIds) all[id] = value;
    setDecisions(all);
  }, [hunkIds]);

  const handleApply = useCallback(() => {
    onAccept(editing ? editedState : mergeWithDecisions(segments, decisions));
    setEditing(false);
    setDecisions({});
  }, [editing, editedState, segments, decisions, onAccept]);

  const handleReject = useCallback(() => { setEditing(false); setDecisions({}); onReject(); }, [onReject]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <ReviewHeader isGenerating={isGenerating} editing={editing} hunkCount={hunkIds.length}
        pendingCount={pendingCount} showDiff={showDiff} onToggleDiff={() => setShowDiff(!showDiff)} />
      <ContentView isGenerating={isGenerating} editing={editing} showDiff={showDiff}
        editedState={editedState} setEditedState={setEditedState} proposedStoryState={proposedStoryState}
        segments={segments} decisions={decisions} onDecide={handleDecide} />
      {!isGenerating && (
        <ReviewActions editing={editing} allResolved={allResolved}
          onEdit={() => { setEditedState(proposedStoryState); setEditing(true); }}
          onCancelEdit={() => setEditing(false)} onApply={handleApply}
          bulk={{ acceptAll: () => setAllDecisions("accepted"), rejectAll: () => setAllDecisions("rejected") }}
          onReject={handleReject} />
      )}
    </div>
  );
}

function ReviewHeader({ isGenerating, editing, hunkCount, pendingCount, showDiff, onToggleDiff }: {
  isGenerating: boolean; editing: boolean; hunkCount: number;
  pendingCount: number; showDiff: boolean; onToggleDiff: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
          {isGenerating ? "Generating…" : "Pending Update"}
        </Badge>
        {!isGenerating && hunkCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {hunkCount} change{hunkCount !== 1 ? "s" : ""}
            {pendingCount > 0 && ` · ${pendingCount} pending`}
          </span>
        )}
      </div>
      {!isGenerating && !editing && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onToggleDiff}>
          <ArrowLeftRight className="mr-1 h-3 w-3" /> {showDiff ? "Raw" : "Diff"}
        </Button>
      )}
    </div>
  );
}

function ContentView({ isGenerating, editing, showDiff, editedState, setEditedState, proposedStoryState, segments, decisions, onDecide }: {
  isGenerating: boolean; editing: boolean; showDiff: boolean;
  editedState: string; setEditedState: (v: string) => void; proposedStoryState: string;
  segments: ReturnType<typeof segmentDiff>; decisions: Record<number, HunkDecision>;
  onDecide: (hunkId: number, decision: HunkDecision) => void;
}) {
  if (isGenerating) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Analyzing conversation…</span>
      </div>
    );
  }
  if (editing) {
    return <Textarea value={editedState} onChange={(e) => setEditedState(e.target.value)} className="min-h-48 font-mono text-xs leading-relaxed" />;
  }
  if (showDiff) {
    return <DiffView segments={segments} decisions={decisions} onDecide={onDecide} />;
  }
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border border-border/40 bg-background/50 p-2">
      <pre className="whitespace-pre-wrap text-xs font-mono">{proposedStoryState}</pre>
    </div>
  );
}
