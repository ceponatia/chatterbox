"use client";

import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RotateCcw, Clock, Upload } from "lucide-react";
import { StoryStateReview, type StoryStateReviewProps } from "./story-state-review";
import { StateHistory } from "./state-history";
import type { StateHistoryEntry } from "@/lib/state-history";

export interface PendingReview extends StoryStateReviewProps {
  active: boolean;
}

interface StoryStateEditorProps {
  value: string;
  onChange: (value: string) => void;
  onImport: (content: string) => void;
  onReset: () => void;
  baseline: string | null;
  lastUpdated: string | null;
  review: PendingReview;
  /** When false (production mode), the blocking review section is hidden */
  reviewMode: boolean;
  /** Recent state update indicator — true briefly after a pipeline update */
  recentlyUpdated: boolean;
  /** State history entries to display */
  stateHistory: StateHistoryEntry[];
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function StoryStateEditor({ value, onChange, onImport, onReset, baseline, lastUpdated, review, reviewMode, recentlyUpdated, stateHistory }: StoryStateEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImport(reader.result);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm font-semibold">Story State</Label>
          <div className="flex items-center gap-1.5">
            {recentlyUpdated && (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" title="State recently updated" />
            )}
            {lastUpdated && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                Last updated: {formatTimestamp(lastUpdated)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.md"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            title="Import from .json or .md file"
          >
            <Upload className="mr-1 h-3 w-3" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={baseline === null}
            title={baseline !== null ? "Reset to imported baseline" : "Import a file first"}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Cast, scene, threads, hard facts. Injected after system prompt each request. Update every 10–20 turns.
      </p>

      {/* Pending review section — only shown in review mode */}
      {reviewMode && review.active && (
        <>
          <StoryStateReview
            proposedStoryState={review.proposedStoryState}
            currentStoryState={review.currentStoryState}
            isGenerating={review.isGenerating}
            onAccept={review.onAccept}
            onReject={review.onReject}
          />
          <Separator />
        </>
      )}

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-48 font-mono text-xs leading-relaxed"
        placeholder="Enter story state..."
      />

      <Separator />
      <StateHistory entries={stateHistory} />
    </div>
  );
}
