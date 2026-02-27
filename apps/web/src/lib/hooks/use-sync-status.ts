"use client";

import { useState, useCallback } from "react";

export type SyncStatus = "saved" | "pending" | "error";

/**
 * Tracks whether in-memory edits have been persisted to localStorage.
 *
 * - `saved`  — last auto-save completed, no edits since (green dot)
 * - `pending` — edits made since last save, waiting for debounce (yellow dot)
 * - `error`   — a conversion/parse error occurred (red dot)
 */
export function useSyncStatus() {
  const [storyStateSync, setStoryStateSync] = useState<SyncStatus>("saved");
  const [systemPromptSync, setSystemPromptSync] = useState<SyncStatus>("saved");

  const markStoryStatePending = useCallback(() => {
    setStoryStateSync("pending");
  }, []);

  const markStoryStateError = useCallback(() => {
    setStoryStateSync("error");
  }, []);

  const markStoryStateSaved = useCallback(() => {
    setStoryStateSync(prev => prev === "error" ? "error" : "saved");
  }, []);

  const markSystemPromptPending = useCallback(() => {
    setSystemPromptSync("pending");
  }, []);

  const markSystemPromptError = useCallback(() => {
    setSystemPromptSync("error");
  }, []);

  const markSystemPromptSaved = useCallback(() => {
    setSystemPromptSync(prev => prev === "error" ? "error" : "saved");
  }, []);

  // Called by auto-save after successful persist
  const markAllSaved = useCallback(() => {
    setStoryStateSync(prev => prev === "error" ? "error" : "saved");
    setSystemPromptSync(prev => prev === "error" ? "error" : "saved");
  }, []);

  return {
    storyStateSync,
    systemPromptSync,
    markStoryStatePending,
    markStoryStateError,
    markStoryStateSaved,
    markSystemPromptPending,
    markSystemPromptError,
    markSystemPromptSaved,
    markAllSaved,
  };
}
