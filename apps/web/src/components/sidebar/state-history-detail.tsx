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
import { computeLineDiff } from "@/lib/diff";
import {
  DISPOSITION_CONFIG,
  formatTime,
  ValidationBadge,
} from "./state-history-shared";

interface StateHistoryDetailProps {
  entry: StateHistoryEntry | null;
  onClose: () => void;
}

const DIFF_COLORS = {
  unchanged: "",
  added: "bg-green-500/10 text-green-400",
  removed: "bg-red-500/10 text-red-400 line-through",
} as const;

const DIFF_PREFIX = { unchanged: " ", added: "+", removed: "-" } as const;

export function StateHistoryDetail({
  entry,
  onClose,
}: StateHistoryDetailProps) {
  const diff = useMemo(() => {
    if (!entry) return [];
    return computeLineDiff(entry.previousState, entry.newState);
  }, [entry]);

  if (!entry) return null;

  const config = DISPOSITION_CONFIG[entry.disposition];

  return (
    <Dialog
      open={!!entry}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden sm:max-w-[92vw] xl:max-w-350">
        <DialogHeader>
          <DialogTitle className="text-sm">
            State Update — turns {entry.turnRange[0]}–{entry.turnRange[1]}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            {formatTime(entry.timestamp)}
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${config.className}`}
            >
              {config.label}
            </Badge>
            <span className="text-muted-foreground">
              diff {entry.validation.diffPercentage}%
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {/* Validation */}
          <Section title="Validation">
            <div className="flex flex-wrap gap-1.5">
              <ValidationBadge
                label="Schema"
                pass={entry.validation.schemaValid}
              />
              <ValidationBadge
                label="Hard facts"
                pass={entry.validation.allHardFactsPreserved}
              />
              <ValidationBadge
                label="No hallucination"
                pass={entry.validation.noUnknownFacts}
              />
              <ValidationBadge
                label="Complete"
                pass={entry.validation.outputComplete}
              />
            </div>
          </Section>

          {/* Extracted facts / changes */}
          {entry.extractedFacts.length > 0 && (
            <Section title={`Changes (${entry.extractedFacts.length})`}>
              <ul className="flex flex-col gap-1">
                {entry.extractedFacts.map((fact, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px]">
                    <Badge
                      variant="secondary"
                      className="mt-0.5 shrink-0 px-1 py-0 text-[9px] font-mono"
                    >
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
                  <span className="mr-2 select-none text-muted-foreground/40">
                    {DIFF_PREFIX[line.type]}
                  </span>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-semibold text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
