"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, RefreshCw, Pencil } from "lucide-react";
import type { StateHistoryEntry } from "@/lib/state-history";
import { StateHistoryDetail } from "@/components/sidebar/state-history-detail";

interface StateHistoryProps {
  entries: StateHistoryEntry[];
}

const DISPOSITION_CONFIG = {
  auto_accepted: { label: "Auto-accepted", icon: CheckCircle2, className: "text-green-600 border-green-500/50" },
  flagged: { label: "Flagged", icon: AlertTriangle, className: "text-amber-600 border-amber-500/50" },
  retried: { label: "Retried", icon: RefreshCw, className: "text-orange-600 border-orange-500/50" },
  manual_edit: { label: "Manual", icon: Pencil, className: "text-blue-600 border-blue-500/50" },
} as const;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export function StateHistory({ entries }: StateHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<StateHistoryEntry | null>(null);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
        <History className="h-5 w-5" />
        <p className="text-xs">No state updates yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">State History</span>
        <span className="text-[10px] text-muted-foreground">({entries.length})</span>
      </div>
      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {[...entries].reverse().map((entry) => (
          <HistoryEntry
            key={entry.id}
            entry={entry}
            isExpanded={expanded === entry.id}
            onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
            onOpenDetail={() => setDetailEntry(entry)}
          />
        ))}
      </div>
      <StateHistoryDetail entry={detailEntry} onClose={() => setDetailEntry(null)} />
    </div>
  );
}

function HistoryEntry({ entry, isExpanded, onToggle, onOpenDetail }: {
  entry: StateHistoryEntry; isExpanded: boolean; onToggle: () => void; onOpenDetail: () => void;
}) {
  const config = DISPOSITION_CONFIG[entry.disposition];
  const Icon = config.icon;

  return (
    <div className="rounded-md border border-border/50 bg-background/50 text-xs">
      <div className="flex items-center">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50 rounded-l-md transition-colors"
          onClick={onOpenDetail}
        >
          <Icon className={`h-3 w-3 shrink-0 ${config.className.split(" ")[0]}`} />
          <span className="text-muted-foreground">{formatTime(entry.timestamp)}</span>
          <span className="text-muted-foreground">turns {entry.turnRange[0]}–{entry.turnRange[1]}</span>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${config.className}`}>
            {config.label}
          </Badge>
        </button>
        <Button variant="ghost" size="sm" className="h-auto shrink-0 px-1.5 py-1.5" onClick={onToggle}>
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {isExpanded && <ExpandedDetails entry={entry} />}
    </div>
  );
}

function ExpandedDetails({ entry }: { entry: StateHistoryEntry }) {
  return (
    <div className="flex flex-col gap-2 border-t px-2.5 py-2">
      {/* Validation summary */}
      <div className="flex flex-wrap gap-1.5">
        <ValidationBadge label="Schema" pass={entry.validation.schemaValid} />
        <ValidationBadge label="Hard facts" pass={entry.validation.allHardFactsPreserved} />
        <ValidationBadge label="No hallucination" pass={entry.validation.noUnknownFacts} />
        <ValidationBadge label="Complete" pass={entry.validation.outputComplete} />
        <span className="text-[10px] text-muted-foreground">
          diff {entry.validation.diffPercentage}%
        </span>
      </div>

      {/* Extracted facts */}
      {entry.extractedFacts.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">
            Extracted facts ({entry.extractedFacts.length})
          </span>
          <ul className="flex flex-col gap-0.5 pl-2">
            {entry.extractedFacts.map((fact, i) => (
              <li key={i} className="text-[10px] text-muted-foreground">
                <span className="font-mono text-[9px] text-muted-foreground/70">[{fact.type}]</span>{" "}
                {fact.detail}
                <span className="ml-1 text-muted-foreground/50">t{fact.sourceTurn}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ValidationBadge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] border ${
      pass ? "border-green-500/30 text-green-600" : "border-red-500/30 text-red-600"
    }`}>
      {pass ? "✓" : "✗"} {label}
    </span>
  );
}
