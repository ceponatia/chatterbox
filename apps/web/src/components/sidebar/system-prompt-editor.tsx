"use client";

import { useRef, useState } from "react";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RotateCcw, Upload } from "lucide-react";
import { DeferredTextarea } from "./deferred-inputs";
import type { Entity } from "@/lib/story-state-model";
import { SegmentCard } from "./system-prompt-segment-card";

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onImport: (content: string) => void;
  onReset: () => void;
  baseline: string | null;
  segments: SerializedSegment[] | null;
  onSegmentUpdate: (
    segmentId: string,
    patch: { content?: string; omittedSummary?: string },
  ) => void;
  entities: Entity[];
  onCharacterFileImport: (
    content: string,
    entityId: string,
    entityName: string,
  ) => void;
  lastIncludedAt: Record<string, number>;
  turnNumber: number;
}

export function SystemPromptEditor({
  value,
  onChange,
  onImport,
  onReset,
  baseline,
  segments,
  onSegmentUpdate,
  entities,
  onCharacterFileImport,
  lastIncludedAt,
  turnNumber,
}: SystemPromptEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedEntityId, setSelectedEntityId] = useState("");

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
    e.target.value = "";
  };

  const handleCharacterFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    const entity = entities.find((item) => item.id === selectedEntityId);
    if (!file || !entity) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onCharacterFileImport(reader.result, entity.id, entity.name);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const totalTokens =
    segments?.reduce((sum, s) => sum + s.tokenEstimate, 0) ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="app-editor-header">
        <div className="app-editor-heading">
          <Label className="text-sm font-semibold">System Prompt</Label>
          {segments && (
            <span className="app-editor-summary">
              {segments.length} segments · ~{totalTokens} tokens total
            </span>
          )}
        </div>
        <div className="app-editor-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.md"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={characterFileInputRef}
            type="file"
            accept=".md"
            className="hidden"
            onChange={handleCharacterFileChange}
          />
          <select
            className="app-editor-select h-8"
            value={selectedEntityId}
            onChange={(event) => setSelectedEntityId(event.target.value)}
          >
            <option value="">Link character file…</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name || entity.id}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => characterFileInputRef.current?.click()}
            disabled={!selectedEntityId}
            title="Import character behavior file and link to selected entity"
          >
            <Upload className="mr-1 h-3 w-3" />
            Character
          </Button>
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
            title={
              baseline !== null
                ? "Reset to imported baseline"
                : "Import a file first"
            }
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {segments
          ? "Parsed into segments. Each segment has an injection policy controlling when it's sent to the LLM."
          : "Import a .md file to parse into segments, or edit the raw prompt below."}
      </p>

      {segments ? (
        <div className="flex flex-col gap-1.5">
          {segments.map((seg) => (
            <SegmentCard
              key={seg.id}
              segment={seg}
              onUpdate={(patch) => onSegmentUpdate(seg.id, patch)}
              lastIncluded={lastIncludedAt[seg.id]}
              turnNumber={turnNumber}
              entities={entities}
            />
          ))}
          <Separator className="my-1" />
          <p className="app-editor-summary">
            Badges: <strong>always</strong> = every turn ·{" "}
            <strong>every N</strong> = periodic · <strong>on topic</strong> =
            keyword/semantic match · <strong>on state</strong> = when state
            field exists · <strong>on presence</strong> = linked entity is in
            scene. Green = recently included · Amber = stale (&gt;5 turns).
          </p>
        </div>
      ) : (
        <DeferredTextarea
          value={value}
          onCommit={onChange}
          className="min-h-64 font-mono text-xs leading-relaxed"
          placeholder="Enter your system prompt..."
        />
      )}
    </div>
  );
}
