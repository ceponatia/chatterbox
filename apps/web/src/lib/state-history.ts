/**
 * State history data model — tracks all state changes per conversation.
 * Persisted in Postgres via conversation state-history API routes.
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
  disposition:
    | "auto_accepted"
    | "flagged"
    | "retried"
    | "manual_edit"
    | "rollback";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(
      `State history request failed: ${res.status} ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

export async function loadStateHistory(
  convId: string,
): Promise<StateHistoryEntry[]> {
  return requestJson<StateHistoryEntry[]>(
    `/api/conversations/${convId}/state-history`,
  );
}

export async function appendStateHistoryEntry(
  convId: string,
  entry: StateHistoryEntry,
): Promise<void> {
  await requestJson(`/api/conversations/${convId}/state-history`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}
