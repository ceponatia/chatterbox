"use client";

import { useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RotateCcw, Clock, Upload } from "lucide-react";
import { StoryStateReview, type StoryStateReviewProps } from "./story-state-review";
import { StateHistory } from "./state-history";
import type { StateHistoryEntry } from "@/lib/state-history";
import type { StructuredStoryState } from "@/lib/story-state-model";
import {
  EntitiesSection, RelationshipsSection, AppearanceSection,
  SceneSection, DemeanorSection, BulletListSection, CustomSectionEditor,
} from "./story-state-sections";

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
  reviewMode: boolean;
  recentlyUpdated: boolean;
  stateHistory: StateHistoryEntry[];
  structuredState: StructuredStoryState | null;
  onStructuredStateUpdate: (state: StructuredStoryState) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Header bar (extracted to keep main component under lint thresholds)
// ---------------------------------------------------------------------------

function StoryStateHeader({
  onImport, onReset, baseline, lastUpdated, recentlyUpdated, isStructured,
}: {
  onImport: (content: string) => void;
  onReset: () => void;
  baseline: string | null;
  lastUpdated: string | null;
  recentlyUpdated: boolean;
  isStructured: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onImport(reader.result);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm font-semibold">Story State</Label>
          <div className="flex items-center gap-1.5">
            {recentlyUpdated && (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" title="State recently updated" />
            )}
            {isStructured && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0">Structured</Badge>
            )}
            {lastUpdated && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {formatTimestamp(lastUpdated)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <input ref={fileInputRef} type="file" accept=".json,.md" className="hidden" onChange={handleFileChange} />
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title="Import from .json or .md file">
            <Upload className="mr-1 h-3 w-3" /> Import
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} disabled={baseline === null}
            title={baseline !== null ? "Reset to imported baseline" : "Import a file first"}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {isStructured
          ? "Edit individual entries below. Import a file to overwrite. Serialized to markdown for the LLM."
          : "Import a story state file to enable structured editing."}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Structured editor body (renders all typed sections)
// ---------------------------------------------------------------------------

function StructuredEditorBody({ state, onUpdate }: {
  state: StructuredStoryState;
  onUpdate: (state: StructuredStoryState) => void;
}) {
  const patch = useCallback(
    <K extends keyof StructuredStoryState>(key: K, value: StructuredStoryState[K]) =>
      onUpdate({ ...state, [key]: value }),
    [state, onUpdate],
  );

  const { entities } = state;

  return (
    <div className="flex flex-col gap-1.5">
      <EntitiesSection entities={entities} onUpdate={(v) => patch("entities", v)} />
      <RelationshipsSection
        relationships={state.relationships} entities={entities}
        onUpdate={(v) => patch("relationships", v)}
        onEntitiesUpdate={(v) => patch("entities", v)}
      />
      <AppearanceSection
        entries={state.appearance} entities={entities}
        onUpdate={(v) => patch("appearance", v)}
        onEntitiesUpdate={(v) => patch("entities", v)}
      />
      <SceneSection scene={state.scene} entities={entities} onUpdate={(v) => patch("scene", v)} />
      <DemeanorSection entries={state.demeanor} entities={entities} onUpdate={(v) => patch("demeanor", v)} onEntitiesUpdate={(v) => patch("entities", v)} />
      <BulletListSection
        title="Open Threads" items={state.openThreads.map(t => t.description)}
        onUpdate={(items) => patch("openThreads", items.map(d => ({ description: d })))}
        placeholder="Thread description..." addLabel="Add thread"
      />
      <BulletListSection
        title="Hard Facts" items={state.hardFacts.map(f => f.fact)}
        onUpdate={(items) => patch("hardFacts", items.map(f => ({ fact: f })))}
        placeholder="Hard fact..." addLabel="Add fact"
      />
      <BulletListSection
        title="Style" items={state.style}
        onUpdate={(items) => patch("style", items)}
        placeholder="Style rule..." addLabel="Add rule"
      />
      {state.custom.map((c, i) => (
        <CustomSectionEditor
          key={`custom-${i}`}
          section={c}
          onUpdate={(content) => {
            const updated = [...state.custom];
            updated[i] = { ...c, content };
            patch("custom", updated);
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StoryStateEditor({
  value, onChange, onImport, onReset, baseline, lastUpdated,
  review, reviewMode, recentlyUpdated, stateHistory,
  structuredState, onStructuredStateUpdate,
}: StoryStateEditorProps) {
  const isStructured = structuredState !== null;

  return (
    <div className="flex flex-col gap-3">
      <StoryStateHeader
        onImport={onImport} onReset={onReset} baseline={baseline}
        lastUpdated={lastUpdated} recentlyUpdated={recentlyUpdated}
        isStructured={isStructured}
      />

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

      {isStructured ? (
        <StructuredEditorBody state={structuredState} onUpdate={onStructuredStateUpdate} />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-48 font-mono text-xs leading-relaxed"
          placeholder="Enter story state or import a .md file..."
        />
      )}

      <Separator />
      <StateHistory entries={stateHistory} />
    </div>
  );
}
