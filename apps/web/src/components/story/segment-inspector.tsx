"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";

const SEGMENT_TO_FIELD: Record<string, string> = {
  setting_premise: "setting",
  story_themes: "themes",
  core_rules: "coreRules",
  output_format: "outputFormat",
  npc_framing: "npcFraming",
  narration_guidelines: "narrationGuidelines",
  interaction_guide: "interactionGuidelines",
};

function getSegmentSourceBadge(
  segment: SerializedSegment,
  customizedFields: Partial<Record<string, boolean>>,
): { label: string; className: string } | null {
  const field = SEGMENT_TO_FIELD[segment.id];
  if (field) {
    return customizedFields[field]
      ? {
          label: "customized",
          className: "border-violet-400/40 bg-violet-500/15 text-violet-200",
        }
      : {
          label: "default",
          className: "border-border bg-muted/40 text-muted-foreground",
        };
  }

  if (segment.id.startsWith("custom_")) {
    return {
      label: "custom",
      className: "border-border bg-accent/40 text-foreground",
    };
  }

  if (segment.category === "character") {
    return {
      label: "character",
      className: "border-border bg-secondary text-secondary-foreground",
    };
  }

  return null;
}

function SegmentRow({
  segment,
  customizedFields,
}: {
  segment: SerializedSegment;
  customizedFields: Partial<Record<string, boolean>>;
}) {
  const [open, setOpen] = useState(false);
  const sourceBadge = getSegmentSourceBadge(segment, customizedFields);

  return (
    <div className="app-editor-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 p-2 text-left text-xs"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 font-medium">{segment.label}</span>
        {sourceBadge ? (
          <Badge
            variant="outline"
            className={`text-[10px] ${sourceBadge.className}`}
          >
            {sourceBadge.label}
          </Badge>
        ) : null}
        <Badge variant="outline" className="text-[10px]">
          {segment.policy.type === "every_n"
            ? `every ${segment.policy.n}`
            : segment.policy.type}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {segment.priority}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          ~{segment.tokenEstimate}t
        </span>
      </button>
      {open && (
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: "var(--app-panel-line)" }}
        >
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
            {segment.content}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SegmentInspector({
  segments,
  customizedFields,
}: {
  segments: SerializedSegment[] | null;
  customizedFields?: Partial<Record<string, boolean>>;
}) {
  if (!segments || segments.length === 0) {
    return (
      <div className="app-story-card app-story-stack">
        <h2 className="text-sm font-semibold">Generated Segments</h2>
        <p className="text-xs text-muted-foreground">
          No segments generated yet. Save or regenerate to see segments.
        </p>
      </div>
    );
  }

  const totalTokens = segments.reduce((sum, s) => sum + s.tokenEstimate, 0);
  const nextCustomizedFields = customizedFields ?? {};

  return (
    <div className="app-story-card app-story-stack">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Generated Segments</h2>
        <span className="text-[10px] text-muted-foreground">
          {segments.length} segments | ~{totalTokens} tokens
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {segments.map((segment) => (
          <SegmentRow
            key={segment.id}
            segment={segment}
            customizedFields={nextCustomizedFields}
          />
        ))}
      </div>
    </div>
  );
}
