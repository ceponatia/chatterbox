"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { StateHistoryEntry } from "@/lib/state-history";

interface StateHistoryDetailProps {
  entry: StateHistoryEntry | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Minimal line-level diff
// ---------------------------------------------------------------------------

interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const result: DiffLine[] = [];

  // Walk through old lines — mark removed ones
  let newIdx = 0;
  for (const line of oldLines) {
    // Emit any new lines that appear before this old line
    while (newIdx < newLines.length && !oldSet.has(newLines[newIdx]!)) {
      result.push({ type: "added", text: newLines[newIdx]! });
      newIdx++;
    }
    if (newSet.has(line)) {
      result.push({ type: "same", text: line });
      // Advance newIdx past this matching line
      const matchIdx = newLines.indexOf(line, newIdx);
      if (matchIdx >= 0) {
        // Emit any added lines between newIdx and matchIdx
        for (let i = newIdx; i < matchIdx; i++) {
          if (!oldSet.has(newLines[i]!)) {
            result.push({ type: "added", text: newLines[i]! });
          }
        }
        newIdx = matchIdx + 1;
      }
    } else {
      result.push({ type: "removed", text: line });
    }
  }
  // Remaining new lines
  for (let i = newIdx; i < newLines.length; i++) {
    if (!oldSet.has(newLines[i]!)) {
      result.push({ type: "added", text: newLines[i]! });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DIFF_COLORS = {
  same: "",
  added: "bg-green-500/10 text-green-400",
  removed: "bg-red-500/10 text-red-400 line-through",
} as const;

const DIFF_PREFIX = { same: " ", added: "+", removed: "-" } as const;

export function StateHistoryDetail({ entry, onClose }: StateHistoryDetailProps) {
  const diff = useMemo(() => {
    if (!entry) return [];
    return computeDiff(entry.previousState, entry.newState);
  }, [entry]);

  if (!entry) return null;

  const config = DISPOSITION_LABELS[entry.disposition];

  return (
    <Dialog open={!!entry} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm">
            State Update — turns {entry.turnRange[0]}–{entry.turnRange[1]}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            {formatTime(entry.timestamp)}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.className}`}>
              {config.label}
            </Badge>
            <span className="text-muted-foreground">diff {entry.validation.diffPercentage}%</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {/* Validation */}
          <Section title="Validation">
            <div className="flex flex-wrap gap-1.5">
              <ValBadge label="Schema" pass={entry.validation.schemaValid} />
              <ValBadge label="Hard facts" pass={entry.validation.allHardFactsPreserved} />
              <ValBadge label="No hallucination" pass={entry.validation.noUnknownFacts} />
              <ValBadge label="Complete" pass={entry.validation.outputComplete} />
            </div>
          </Section>

          {/* Extracted facts / changes */}
          {entry.extractedFacts.length > 0 && (
            <Section title={`Changes (${entry.extractedFacts.length})`}>
              <ul className="flex flex-col gap-1">
                {entry.extractedFacts.map((fact, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px]">
                    <Badge variant="secondary" className="mt-0.5 shrink-0 px-1 py-0 text-[9px] font-mono">
                      {fact.type}
                    </Badge>
                    <span className="text-muted-foreground">{fact.detail}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
                      t{fact.sourceTurn} · {Math.round(fact.confidence * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Diff */}
          <Section title="State Diff">
            <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-[10px] leading-relaxed">
              {diff.map((line, i) => (
                <div key={i} className={`${DIFF_COLORS[line.type]} px-1`}>
                  <span className="mr-2 select-none text-muted-foreground/40">{DIFF_PREFIX[line.type]}</span>
                  {line.text || "\u00A0"}
                </div>
              ))}
            </pre>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISPOSITION_LABELS = {
  auto_accepted: { label: "Auto-accepted", className: "text-green-600 border-green-500/50" },
  flagged: { label: "Flagged", className: "text-amber-600 border-amber-500/50" },
  retried: { label: "Retried", className: "text-orange-600 border-orange-500/50" },
  manual_edit: { label: "Manual", className: "text-blue-600 border-blue-500/50" },
} as const;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function ValBadge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] border ${
      pass ? "border-green-500/30 text-green-600" : "border-red-500/30 text-red-600"
    }`}>
      {pass ? "✓" : "✗"} {label}
    </span>
  );
}
