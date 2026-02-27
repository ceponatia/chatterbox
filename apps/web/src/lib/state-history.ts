/**
 * State history data model — tracks all state changes per conversation.
 * Stored in localStorage alongside conversation data.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedFact {
  type: string;
  detail: string;
  sourceTurn: number;
  confidence: number;
}

export interface ValidationReport {
  schemaValid: boolean;
  allHardFactsPreserved: boolean;
  noUnknownFacts: boolean;
  outputComplete: boolean;
  diffPercentage: number;
}

export interface StateHistoryEntry {
  id: string;
  timestamp: string;
  turnRange: [number, number];
  previousState: string;
  newState: string;
  extractedFacts: ExtractedFact[];
  validation: ValidationReport;
  disposition: "auto_accepted" | "flagged" | "retried" | "manual_edit";
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const historyKey = (convId: string) => `chatterbox-state-history-${convId}`;

export function loadStateHistory(convId: string): StateHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyKey(convId));
    return raw ? (JSON.parse(raw) as StateHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveStateHistory(convId: string, history: StateHistoryEntry[]) {
  localStorage.setItem(historyKey(convId), JSON.stringify(history));
}

export function appendStateHistoryEntry(convId: string, entry: StateHistoryEntry) {
  const history = loadStateHistory(convId);
  history.push(entry);
  // Keep last 100 entries to avoid unbounded growth
  if (history.length > 100) history.splice(0, history.length - 100);
  saveStateHistory(convId, history);
}

export function deleteStateHistory(convId: string) {
  localStorage.removeItem(historyKey(convId));
}
