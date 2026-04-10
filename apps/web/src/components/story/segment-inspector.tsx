"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import type { SegmentOverrides } from "@/lib/story-project-types";

type SegmentProvenance = "imported" | "form" | "override";

const BLUEPRINT_SEGMENT_IDS = new Set([
  "core_rules_additions",
  "output_format_custom",
  "setting_scenario",
  "npc_framing_custom",
  "interaction_guidelines",
]);

function resolveProvenance(
  segmentId: string,
  overrides: SegmentOverrides | null,
  hasBlueprint: boolean,
  hasImportedPrompt: boolean,
): SegmentProvenance | null {
  if (overrides?.[segmentId] !== undefined) return "override";
  if (hasBlueprint && BLUEPRINT_SEGMENT_IDS.has(segmentId)) return "form";
  if (hasImportedPrompt) return "imported";
  return null;
}

const PROVENANCE_STYLES: Record<SegmentProvenance, string> = {
  imported: "bg-sky-600/20 text-sky-400",
  form: "bg-violet-600/20 text-violet-400",
  override: "bg-amber-600/20 text-amber-400",
};

function SegmentRow({
  segment,
  provenance,
}: {
  segment: SerializedSegment;
  provenance: SegmentProvenance | null;
}) {
  const [open, setOpen] = useState(false);

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
        {provenance && (
          <Badge className={`text-[10px] ${PROVENANCE_STYLES[provenance]}`}>
            {provenance}
          </Badge>
        )}
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
  overrides,
  hasBlueprint,
  hasImportedPrompt,
}: {
  segments: SerializedSegment[] | null;
  overrides?: SegmentOverrides | null;
  hasBlueprint?: boolean;
  hasImportedPrompt?: boolean;
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

  return (
    <div className="app-story-card app-story-stack">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Generated Segments</h2>
        <span className="text-[10px] text-muted-foreground">
          {segments.length} segments &middot; ~{totalTokens} tokens
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {segments.map((segment) => (
          <SegmentRow
            key={segment.id}
            segment={segment}
            provenance={resolveProvenance(
              segment.id,
              overrides ?? null,
              hasBlueprint ?? false,
              hasImportedPrompt ?? false,
            )}
          />
        ))}
      </div>
    </div>
  );
}
