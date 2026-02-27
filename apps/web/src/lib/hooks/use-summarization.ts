"use client";

import { useState, useCallback, useEffect } from "react";
import type { UIMessage } from "ai";

interface ReadonlyConfig {
  systemPrompt: string;
  storyState: string;
}

interface Params {
  messages: UIMessage[];
  isLoading: boolean;
  autoSummarizeInterval: number;
  liveConfig: ReadonlyConfig;
  onAccept: (newState: string) => void;
  lastSummarizedTurn: number;
  setLastSummarizedTurn: (turn: number) => void;
}

export function useSummarization({ messages, isLoading, autoSummarizeInterval, liveConfig, onAccept, lastSummarizedTurn, setLastSummarizedTurn }: Params) {
  const [hasPendingReview, setHasPendingReview] = useState(false);
  const [proposedStoryState, setProposedStoryState] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);

  const reset = useCallback(() => {
    setHasPendingReview(false);
    setProposedStoryState("");
    setIsSummarizing(false);
  }, []);

  const triggerSummarize = useCallback(async () => {
    setHasPendingReview(true);
    setIsSummarizing(true);
    setProposedStoryState("");
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          currentStoryState: liveConfig.storyState,
          systemPrompt: liveConfig.systemPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.storyState?.trim()) {
        const msg = data.error || "Provider returned empty response.";
        setProposedStoryState(`Error: ${msg} Please reject and retry.`);
      } else {
        setProposedStoryState(data.storyState);
      }
    } catch (err) {
      console.error("Summarization failed:", err);
      setProposedStoryState("Error: summarization request failed. Please try again.");
    } finally {
      setIsSummarizing(false);
    }
  }, [messages, liveConfig]);

  const handleAcceptSummary = useCallback(
    (newState: string) => {
      if (!newState.trim() || newState.startsWith("Error:")) return;
      onAccept(newState);
      const turnCount = messages.filter((m) => m.role === "user").length;
      setLastSummarizedTurn(turnCount);
      setHasPendingReview(false);
      setProposedStoryState("");
    },
    [messages, onAccept, setLastSummarizedTurn]
  );

  const handleRejectSummary = useCallback(() => {
    const turnCount = messages.filter((m) => m.role === "user").length;
    setLastSummarizedTurn(turnCount);
    setHasPendingReview(false);
    setProposedStoryState("");
  }, [messages, setLastSummarizedTurn]);

  // Auto-trigger summarization
  useEffect(() => {
    if (isLoading || hasPendingReview) return;
    const turnCount = messages.filter((m) => m.role === "user").length;
    if (autoSummarizeInterval > 0 && turnCount > 0 && turnCount >= lastSummarizedTurn + autoSummarizeInterval) {
      triggerSummarize();
    }
  }, [messages, isLoading, hasPendingReview, autoSummarizeInterval, lastSummarizedTurn, triggerSummarize]);

  return {
    hasPendingReview,
    proposedStoryState,
    isSummarizing,
    triggerSummarize,
    handleAcceptSummary,
    handleRejectSummary,
    reset,
  };
}
