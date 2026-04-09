"use client";

import { useId, useState } from "react";
import type {
  SerializedPolicy,
  SerializedSegment,
} from "@chatterbox/prompt-assembly";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { Entity } from "@chatterbox/state-model";
import { DeferredInput, DeferredTextarea } from "./deferred-inputs";
import { ChevronDown, ChevronRight } from "lucide-react";

function policyLabel(policy: SerializedPolicy): string {
  switch (policy.type) {
    case "always":
      return "always";
    case "every_n":
      return `every ${policy.n}`;
    case "on_topic":
      return "on topic";
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
    case "on_state_field":
    case "on_presence":
      return "outline";
  }
}

function SegmentSummary({
  segment,
  linkedEntityLabel,
}: {
  segment: SerializedSegment;
  linkedEntityLabel: string | null;
}) {
  return (
    <div className="app-editor-summary flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
        {segment.priority}
      </Badge>
      <span>order: {segment.order}</span>
      <span>cat: {segment.category}</span>
      {segment.policy.type === "on_topic" && (
        <span
          className="truncate max-w-40"
          title={segment.policy.keywords.join(", ")}
        >
          kw: {segment.policy.keywords.slice(0, 4).join(", ")}
          {segment.policy.keywords.length > 4 ? "..." : ""}
        </span>
      )}
      {linkedEntityLabel && (
        <span
          className="truncate max-w-40"
          title={`Linked entity: ${linkedEntityLabel}`}
        >
          linked: {linkedEntityLabel}
        </span>
      )}
    </div>
  );
}

function SegmentBody({
  segment,
  onUpdate,
  linkedEntityLabel,
}: {
  segment: SerializedSegment;
  onUpdate: (patch: { content?: string; omittedSummary?: string }) => void;
  linkedEntityLabel: string | null;
}) {
  return (
    <>
      <SegmentSummary segment={segment} linkedEntityLabel={linkedEntityLabel} />
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
    </>
  );
}

export function SegmentCard({
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
  const linkedEntityLabel = linkedEntityId
    ? (entities.find((entity) => entity.id === linkedEntityId)?.name ??
      linkedEntityId)
    : null;

  return (
    <div className="app-editor-section">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        className="app-editor-section-trigger"
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
            className={`text-[10px] tabular-nums ${isStale ? "app-status-stale" : "app-status-recent"}`}
          >
            {turnsAgo === 0 ? "now" : `${turnsAgo}t ago`}
          </span>
        )}
      </button>
      {expanded && (
        <div id={contentId} className="app-editor-section-body">
          <SegmentBody
            segment={segment}
            onUpdate={onUpdate}
            linkedEntityLabel={linkedEntityLabel}
          />
        </div>
      )}
    </div>
  );
}
