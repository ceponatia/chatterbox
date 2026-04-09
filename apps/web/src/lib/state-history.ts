/**
 * State history data model — tracks all state changes per conversation.
 * Persisted in Postgres via conversation state-history API routes.
 *
 * Pipeline-level types (StatePipelineChange, StatePipelineValidation,
 * StatePipelineDisposition) live in @chatterbox/sockets. This module
 * re-uses them and adds app-level history concerns (manual_edit, rollback).
 */

import type {
  StatePipelineChange,
  StatePipelineValidation,
  StatePipelineDisposition,
} from "@chatterbox/sockets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Disposition for history entries. Extends the pipeline disposition with
 * app-level values that are never produced by the pipeline itself.
 */
export type StateHistoryDisposition =
  | StatePipelineDisposition
  | "manual_edit"
  | "rollback";

export interface StateHistoryEntry {
  id: string;
  timestamp: string;
  turnRange: [number, number];
  previousState: string;
  newState: string;
  extractedFacts: StatePipelineChange[];
  validation: StatePipelineValidation;
  disposition: StateHistoryDisposition;
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
