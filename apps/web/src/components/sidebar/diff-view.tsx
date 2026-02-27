"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiffLine, DiffSegment, HunkDecision } from "@/lib/diff";

const DIFF_STYLES: Record<DiffLine["type"], string> = {
  added: "bg-green-500/15 text-green-700 dark:text-green-400",
  removed: "bg-red-500/15 text-red-700 dark:text-red-400 line-through",
  unchanged: "text-muted-foreground",
};

const DIFF_PREFIX: Record<DiffLine["type"], string> = {
  added: "+",
  removed: "−",
  unchanged: " ",
};

interface DiffViewProps {
  segments: DiffSegment[];
  decisions: Record<number, HunkDecision>;
  onDecide: (hunkId: number, decision: HunkDecision) => void;
}

function DiffLineRow({ line }: { line: DiffLine }) {
  return (
    <div className={DIFF_STYLES[line.type]}>
      <span className="inline-block w-4 select-none opacity-60">
        {DIFF_PREFIX[line.type]}
      </span>
      {line.text || "\u00A0"}
    </div>
  );
}

function HunkBlock({
  segment,
  decision,
  onDecide,
}: {
  segment: DiffSegment & { kind: "hunk" };
  decision: HunkDecision | undefined;
  onDecide: (d: HunkDecision) => void;
}) {
  const resolved = decision != null;
  const borderColor = decision === "accepted"
    ? "border-green-500/40"
    : decision === "rejected"
      ? "border-red-500/40"
      : "border-amber-500/40";

  return (
    <div className={`my-1 rounded border ${borderColor} bg-background/30`}>
      <div className="px-1 py-0.5">
        {segment.lines.map((line, i) => {
          if (resolved) {
            if (decision === "accepted" && line.type === "removed") return null;
            if (decision === "rejected" && line.type === "added") return null;
          }
          return <DiffLineRow key={i} line={line} />;
        })}
      </div>
      {!resolved && (
        <div className="flex items-center gap-1 border-t border-border/30 px-1 py-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-green-600 hover:text-green-500 hover:bg-green-500/10"
            onClick={() => onDecide("accepted")}
          >
            <Check className="mr-0.5 h-2.5 w-2.5" />
            Accept
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-red-600 hover:text-red-500 hover:bg-red-500/10"
            onClick={() => onDecide("rejected")}
          >
            <X className="mr-0.5 h-2.5 w-2.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export function DiffView({ segments, decisions, onDecide }: DiffViewProps) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border border-border/40 bg-background/50 p-2">
      <div className="space-y-0 font-mono text-xs leading-relaxed">
        {segments.map((seg, idx) =>
          seg.kind === "context" ? (
            <div key={`ctx-${idx}`}>
              {seg.lines.map((line, i) => (
                <DiffLineRow key={i} line={line} />
              ))}
            </div>
          ) : (
            <HunkBlock
              key={`hunk-${seg.id}`}
              segment={seg}
              decision={decisions[seg.id]}
              onDecide={(d) => onDecide(seg.id, d)}
            />
          )
        )}
      </div>
    </div>
  );
}
