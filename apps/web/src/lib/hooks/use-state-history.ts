"use client";

import { useSyncExternalStore, useCallback } from "react";
import { loadStateHistory, type StateHistoryEntry } from "@/lib/state-history";

const EMPTY: StateHistoryEntry[] = [];

/**
 * Reads state history entries from localStorage for a conversation.
 *
 * Uses useSyncExternalStore so the read happens during render (no
 * setState-in-effect). The `version` counter acts as a subscription
 * signal — when the pipeline appends entries it bumps version, which
 * causes React to re-call getSnapshot and pick up the new data.
 */
export function useStateHistoryEntries(convId: string | null, version: number): StateHistoryEntry[] {
  const getSnapshot = useCallback(
    () => (convId ? loadStateHistory(convId) : EMPTY),
    [convId, version], // eslint-disable-line react-hooks/exhaustive-deps -- version is an intentional cache-buster
  );

  // Subscribe is a no-op — we rely on React re-rendering when version changes
  const subscribe = useCallback((_cb: () => void) => () => {}, []);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
