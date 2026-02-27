"use client";

import { useCallback, useState } from "react";
import type { UIMessage } from "ai";
import {
  appendStateHistoryEntry,
  type ExtractedFact,
  type ValidationReport,
} from "@/lib/state-history";
import { generateId } from "@/lib/storage";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import { computeCascadeResets } from "@/lib/state-pipeline/cascade-triggers";
import { buildCharacterSegmentLookup } from "@/lib/prompt-segment-utils";

interface StateRollbackResponse {
  newState: string;
  extractedFacts: ExtractedFact[];
  validation: ValidationReport;
  disposition: "rollback";
  cascadeResets?: string[];
  turnNumber: number;
  error?: string;
}

interface Params {
  messages: UIMessage[];
  handleDeleteAfter: (id: string) => UIMessage[];
  storyState: string;
  activeConvId: string | null;
  model: string;
  setLastPipelineTurn: (turn: number) => void;
  updateStoryStateFromSummary: (newState: string, turnNumber?: number) => void;
  onCascadeResets: (ids: string[]) => void;
  customSegments?: SerializedSegment[] | null;
}

interface TruncateContext {
  remainingMessages: UIMessage[];
  removedMessages: UIMessage[];
  turnNumber: number;
}

function buildTruncateContext(
  messages: UIMessage[],
  id: string,
  handleDeleteAfter: (id: string) => UIMessage[],
): TruncateContext | null {
  const idx = messages.findIndex((message) => message.id === id);
  if (idx < 0) return null;

  const remainingMessages = messages.slice(0, idx + 1);
  const removedMessages = handleDeleteAfter(id);
  if (removedMessages.length === 0) return null;

  return {
    remainingMessages,
    removedMessages,
    turnNumber: remainingMessages.filter((m) => m.role === "user").length,
  };
}

function shouldSkipRollback(
  storyState: string,
  activeConvId: string | null,
): boolean {
  return !storyState.trim() || !activeConvId;
}

async function requestRollback(
  context: TruncateContext,
  storyState: string,
  model: string,
): Promise<StateRollbackResponse | null> {
  const response = await fetch("/api/state-rollback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deletedMessages: context.removedMessages,
      remainingMessages: context.remainingMessages.slice(-20),
      currentStoryState: storyState,
      turnNumber: context.turnNumber,
      model,
    }),
  });

  if (!response.ok) {
    console.warn(`state-rollback: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = (await response.json()) as StateRollbackResponse;
  if (data.error || !data.newState.trim() || data.newState === storyState) {
    return null;
  }
  return data;
}

export function useDeleteAfterRollback(params: Params) {
  const {
    messages,
    handleDeleteAfter,
    storyState,
    activeConvId,
    model,
    setLastPipelineTurn,
    updateStoryStateFromSummary,
    onCascadeResets,
    customSegments,
  } = params;
  const [rollbackHistoryVersion, setRollbackHistoryVersion] = useState(0);

  const handleDeleteAfterWithRollback = useCallback(
    async (id: string) => {
      const context = buildTruncateContext(messages, id, handleDeleteAfter);
      if (!context) return;

      setLastPipelineTurn(context.turnNumber);
      if (shouldSkipRollback(storyState, activeConvId)) return;

      try {
        const data = await requestRollback(context, storyState, model);
        if (!data || !activeConvId) return;

        updateStoryStateFromSummary(data.newState, data.turnNumber);
        await appendStateHistoryEntry(activeConvId, {
          id: generateId(),
          timestamp: new Date().toISOString(),
          turnRange: [context.turnNumber, context.turnNumber],
          previousState: storyState,
          newState: data.newState,
          extractedFacts: data.extractedFacts,
          validation: data.validation,
          disposition: "rollback",
        });

        const dynamicResets = computeCascadeResets(
          data.extractedFacts,
          buildCharacterSegmentLookup(customSegments),
        );
        const merged = new Set<string>([
          ...(data.cascadeResets ?? []),
          ...dynamicResets,
        ]);
        if (merged.size > 0) {
          onCascadeResets([...merged]);
        }

        setRollbackHistoryVersion((version) => version + 1);
      } catch (error) {
        console.error("state-rollback error:", error);
      }
    },
    [
      messages,
      handleDeleteAfter,
      storyState,
      activeConvId,
      model,
      setLastPipelineTurn,
      updateStoryStateFromSummary,
      onCascadeResets,
      customSegments,
    ],
  );

  return {
    handleDeleteAfterWithRollback,
    rollbackHistoryVersion,
  };
}
