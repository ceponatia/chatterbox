"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
}

export function useSummarization({ messages, isLoading, autoSummarizeInterval, liveConfig, onAccept }: Params) {
  const [hasPendingReview, setHasPendingReview] = useState(false);
  const [proposedStoryState, setProposedStoryState] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const lastSummarizedTurnRef = useRef(0);

  const reset = useCallback(() => {
    setHasPendingReview(false);
    setProposedStoryState("");
    setIsSummarizing(false);
    lastSummarizedTurnRef.current = 0;
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
      lastSummarizedTurnRef.current = turnCount;
      setHasPendingReview(false);
      setProposedStoryState("");
    },
    [messages, onAccept]
  );

  const handleRejectSummary = useCallback(() => {
    const turnCount = messages.filter((m) => m.role === "user").length;
    lastSummarizedTurnRef.current = turnCount;
    setHasPendingReview(false);
    setProposedStoryState("");
  }, [messages]);

  // Auto-trigger summarization
  useEffect(() => {
    if (isLoading || hasPendingReview) return;
    const turnCount = messages.filter((m) => m.role === "user").length;
    if (autoSummarizeInterval > 0 && turnCount > 0 && turnCount >= lastSummarizedTurnRef.current + autoSummarizeInterval) {
      triggerSummarize();
    }
  }, [messages, isLoading, hasPendingReview, autoSummarizeInterval, triggerSummarize]);

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
