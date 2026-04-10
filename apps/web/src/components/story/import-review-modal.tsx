"use client";

import { useMemo } from "react";
import { AlertTriangle, FileText, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseSystemPromptToSegments } from "@chatterbox/prompt-assembly";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import {
  parseMarkdownToStructured,
  type StructuredStoryState,
} from "@chatterbox/state-model";
import type { ImportMode, StoryProjectDetail } from "@/lib/story-project-types";

export interface ImportReviewInput {
  systemPromptMarkdown?: string;
  storyStateMarkdown?: string;
}

interface ParsedPreview {
  segments: SerializedSegment[];
  structured: StructuredStoryState | null;
}

function parsePreview(input: ImportReviewInput): ParsedPreview {
  const segments = input.systemPromptMarkdown?.trim()
    ? parseSystemPromptToSegments(input.systemPromptMarkdown)
    : [];
  const structured = input.storyStateMarkdown?.trim()
    ? parseMarkdownToStructured(input.storyStateMarkdown)
    : null;
  return { segments, structured };
}

function SegmentPreviewList({
  segments,
  existingSegmentIds,
}: {
  segments: SerializedSegment[];
  existingSegmentIds: Set<string>;
}) {
  if (segments.length === 0) return null;

  return (
    <div className="app-editor-card space-y-2 p-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold">
          System Prompt: {segments.length} segments
        </h3>
      </div>
      <div className="flex flex-col gap-1">
        {segments.map((segment) => {
          const isNew = !existingSegmentIds.has(segment.id);
          const isCustom = segment.id.startsWith("custom_");
          return (
            <div
              key={segment.id}
              className="flex items-center gap-2 text-[11px]"
            >
              <span className="flex-1 truncate font-medium">
                {segment.label}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {segment.category ?? "other"}
              </Badge>
              {isCustom && (
                <Badge variant="secondary" className="text-[10px]">
                  custom
                </Badge>
              )}
              {isNew ? (
                <Badge className="bg-emerald-600/20 text-emerald-400 text-[10px]">
                  new
                </Badge>
              ) : (
                <Badge className="bg-amber-600/20 text-amber-400 text-[10px]">
                  exists
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatePreviewSummary({
  structured,
  existingState,
}: {
  structured: StructuredStoryState;
  existingState: StructuredStoryState | null;
}) {
  const existingEntityNames = useMemo(
    () =>
      new Set(
        existingState?.entities.map((e) => e.name.trim().toLowerCase()) ?? [],
      ),
    [existingState],
  );

  const newEntityCount = structured.entities.filter(
    (e) => !existingEntityNames.has(e.name.trim().toLowerCase()),
  ).length;

  return (
    <div className="app-editor-card space-y-2 p-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold">Story State</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Entities</span>
        <span>
          {structured.entities.length}
          {newEntityCount > 0 && (
            <span className="ml-1 text-emerald-400">
              ({newEntityCount} new)
            </span>
          )}
        </span>
        <span className="text-muted-foreground">Relationships</span>
        <span>{structured.relationships.length}</span>
        <span className="text-muted-foreground">Hard facts</span>
        <span>{structured.hardFacts.length}</span>
        <span className="text-muted-foreground">Open threads</span>
        <span>{structured.openThreads.length}</span>
        <span className="text-muted-foreground">Appearance</span>
        <span>{structured.appearance.length}</span>
        <span className="text-muted-foreground">Demeanor</span>
        <span>{structured.demeanor.length}</span>
        {structured.custom.length > 0 && (
          <>
            <span className="text-muted-foreground">Custom sections</span>
            <span>{structured.custom.length}</span>
          </>
        )}
      </div>
    </div>
  );
}

export interface ImportReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ImportReviewInput;
  project: StoryProjectDetail;
  busy: boolean;
  onConfirm: (mode: ImportMode) => void;
}

export function ImportReviewModal({
  open,
  onOpenChange,
  input,
  project,
  busy,
  onConfirm,
}: ImportReviewModalProps) {
  const preview = useMemo(() => parsePreview(input), [input]);

  const existingSegmentIds = useMemo(
    () => new Set(project.generatedSegments?.map((s) => s.id) ?? []),
    [project.generatedSegments],
  );

  const hasPrompt = preview.segments.length > 0;
  const hasState = preview.structured !== null;

  if (!hasPrompt && !hasState) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Review</DialogTitle>
            <DialogDescription>Nothing to import.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Review</DialogTitle>
          <DialogDescription>
            Preview the data that will be imported into this project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          {hasPrompt && (
            <SegmentPreviewList
              segments={preview.segments}
              existingSegmentIds={existingSegmentIds}
            />
          )}
          {hasState && preview.structured && (
            <StatePreviewSummary
              structured={preview.structured}
              existingState={project.generatedStructuredState}
            />
          )}

          <div className="flex items-start gap-2 rounded-md bg-amber-900/20 p-2 text-[11px] text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              <strong>Replace</strong> overwrites existing imported data.{" "}
              <strong>Merge</strong> keeps existing data and adds new items
              only.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onConfirm("merge")}
          >
            Merge
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onConfirm("replace")}
          >
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
