"use client";

import { useRef, useState, useId } from "react";
import type {
  SerializedSegment,
  SerializedPolicy,
} from "@chatterbox/prompt-assembly";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RotateCcw, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { DeferredInput, DeferredTextarea } from "./deferred-inputs";
import type { Entity } from "@/lib/story-state-model";

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

function policyLabel(policy: SerializedPolicy): string {
  switch (policy.type) {
    case "always":
      return "always";
    case "every_n":
      return `every ${policy.n}`;
    case "on_topic":
      return `on topic`;
    case "on_state_field":
      return `on state: ${policy.field}`;
    case "on_presence":
      return "on presence";
  }
}

function policyVariant(
  policy: SerializedPolicy,
): "default" | "secondary" | "outline" {
  switch (policy.type) {
    case "always":
      return "default";
    case "every_n":
      return "secondary";
    case "on_topic":
      return "outline";
    case "on_state_field":
      return "outline";
    case "on_presence":
      return "outline";
  }
}

function SegmentCard({
  segment,
  onUpdate,
  lastIncluded,
  turnNumber,
  entities,
}: {
  segment: SerializedSegment;
  onUpdate: (patch: { content?: string; omittedSummary?: string }) => void;
  lastIncluded: number | undefined;
  turnNumber: number;
  entities: Entity[];
}) {
  const uid = useId();
  const contentId = `segment-${uid}`;
  const [expanded, setExpanded] = useState(false);
  const turnsAgo =
    lastIncluded !== undefined ? turnNumber - lastIncluded : undefined;
  const isStale = turnsAgo !== undefined && turnsAgo > 5;
  const linkedEntityId =
    segment.policy.type === "on_presence" ? segment.policy.entityId : null;
  const linkedEntity = linkedEntityId
    ? entities.find((entity) => entity.id === linkedEntityId)
    : null;

  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-xs font-medium">{segment.label}</span>
        <Badge
          variant={policyVariant(segment.policy)}
          className="text-[10px] px-1.5 py-0"
        >
          {policyLabel(segment.policy)}
        </Badge>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ~{segment.tokenEstimate}t
        </span>
        {turnsAgo !== undefined && (
          <span
            className={`text-[10px] tabular-nums ${isStale ? "text-amber-500" : "text-green-500"}`}
          >
            {turnsAgo === 0 ? "now" : `${turnsAgo}t ago`}
          </span>
        )}
      </button>
      {expanded && (
        <div id={contentId} className="border-t px-3 py-2">
          <div className="mb-1.5 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {segment.priority}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              order: {segment.order}
            </span>
            <span className="text-[10px] text-muted-foreground">
              cat: {segment.category}
            </span>
            {segment.policy.type === "on_topic" && (
              <span
                className="text-[10px] text-muted-foreground truncate max-w-40"
                title={segment.policy.keywords.join(", ")}
              >
                kw: {segment.policy.keywords.slice(0, 4).join(", ")}
                {segment.policy.keywords.length > 4 ? "…" : ""}
              </span>
            )}
            {segment.policy.type === "on_presence" && (
              <span
                className="text-[10px] text-muted-foreground truncate max-w-40"
                title={`Linked entity: ${linkedEntity?.name ?? linkedEntityId}`}
              >
                linked: {linkedEntity?.name ?? linkedEntityId}
              </span>
            )}
          </div>
          <DeferredTextarea
            value={segment.content}
            onCommit={(content) => onUpdate({ content })}
            className="min-h-24 font-mono text-[11px] leading-relaxed"
          />
          <div className="mt-2 flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">
              Omitted Summary (shown when this segment is skipped)
            </Label>
            <DeferredInput
              value={segment.omittedSummary ?? ""}
              onCommit={(omittedSummary) =>
                onUpdate({ omittedSummary: omittedSummary.trim() || undefined })
              }
              className="h-7 text-[11px]"
              placeholder="Optional one-line summary"
            />
          </div>
        </div>
      )}
    </div>
  );
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
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm font-semibold">System Prompt</Label>
          {segments && (
            <span className="text-[10px] text-muted-foreground">
              {segments.length} segments · ~{totalTokens} tokens total
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
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
            className="h-8 rounded border bg-background px-2 text-[11px]"
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
          <p className="text-[10px] text-muted-foreground">
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
