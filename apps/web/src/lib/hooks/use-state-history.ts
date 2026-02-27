"use client";

import { useEffect, useState } from "react";
import { loadStateHistory, type StateHistoryEntry } from "@/lib/state-history";

/**
 * Reads state history entries from API/DB for a conversation.
 *
 * The `version` counter acts as a cache-buster — when the pipeline
 * appends entries it bumps version, which triggers a re-fetch.
 */
export function useStateHistoryEntries(
  convId: string | null,
  version: number,
): StateHistoryEntry[] {
  const [entries, setEntries] = useState<StateHistoryEntry[]>([]);

  useEffect(() => {
    let active = true;
    if (!convId) return;

    void (async () => {
      try {
        const history = await loadStateHistory(convId);
        if (!active) return;
        setEntries(history);
      } catch {
        if (!active) return;
        setEntries([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [convId, version]);

  return convId ? entries : [];
}
