"use client";

import { useMemo } from "react";
import { loadStateHistory, type StateHistoryEntry } from "@/lib/state-history";

const EMPTY: StateHistoryEntry[] = [];

/**
 * Reads state history entries from localStorage for a conversation.
 *
 * The `version` counter acts as a cache-buster — when the pipeline
 * appends entries it bumps version, which causes useMemo to recompute.
 */
export function useStateHistoryEntries(convId: string | null, version: number): StateHistoryEntry[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is an intentional cache-buster
  return useMemo(() => (convId ? loadStateHistory(convId) : EMPTY), [convId, version]);
}
