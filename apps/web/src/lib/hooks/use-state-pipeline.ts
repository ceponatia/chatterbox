"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UIMessage } from "ai";
import { appendStateHistoryEntry } from "@/lib/state-history";
import type {
  StatePipelineChange,
  StatePipelineValidation,
} from "@chatterbox/sockets";
import { generateId } from "@/lib/storage";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import { computeCascadeResets } from "@/lib/state-pipeline/cascade-triggers";
import { buildCharacterSegmentLookup } from "@/lib/prompt-segment-utils";
import type { StructuredStoryState } from "@chatterbox/state-model";

const SECTION_STALE_TURNS = 30;

const SECTION_LABELS: Record<string, string> = {
  cast: "Cast",
  relationships: "Relationships",
  characters: "Characters",
  scene: "Scene",
  demeanor: "Current Demeanor",
  openThreads: "Open Threads",
  hardFacts: "Hard Facts",
  style: "Style",
  custom: "Custom Sections",
};

interface StateUpdateResponse {
  newState: string;
  extractedFacts: StatePipelineChange[];
  validation: StatePipelineValidation;
  disposition: "auto_accepted" | "flagged" | "retried";
  cascadeResets?: string[];
  turnNumber: number;
  error?: string;
}

interface Params {
  messages: UIMessage[];
  isLoading: boolean;
  storyState: string;
  structuredState: StructuredStoryState | null;
  model: string;
  conversationId: string | null;
  onStateUpdate: (newState: string, turnNumber?: number) => void;
  /** The existing summarization interval — pipeline uses its own trigger logic */
  autoSummarizeInterval: number;
  /** Callback to reset lastIncludedAt entries for cascade triggers */
  onCascadeResets?: (segmentIds: string[]) => void;
  customSegments?: SerializedSegment[] | null;
  lastPipelineTurn: number;
  setLastPipelineTurn: (turn: number) => void;
}

function usePipelineCompletionTrigger({
  isLoading,
  messages,
  autoSummarizeInterval,
  lastPipelineTurnRef,
  runPipeline,
}: {
  isLoading: boolean;
  messages: UIMessage[];
  autoSummarizeInterval: number;
  lastPipelineTurnRef: MutableRefObject<number>;
  runPipeline: (turnNumber: number) => Promise<void>;
}) {
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;
    if (!wasLoading || isLoading) return;

    const turnNumber = messages.filter(
      (message) => message.role === "user",
    ).length;
    if (turnNumber <= 0) return;

    const interval = autoSummarizeInterval > 0 ? autoSummarizeInterval : 5;
    const turnsSinceLast = turnNumber - lastPipelineTurnRef.current;
    if (turnsSinceLast < interval) return;

    void runPipeline(turnNumber);
  }, [
    isLoading,
    messages,
    autoSummarizeInterval,
    lastPipelineTurnRef,
    runPipeline,
  ]);
}

function computeStaleSections(
  structuredState: StructuredStoryState | null,
  turnNumber: number,
): string[] {
  if (!structuredState?.sectionMeta) return [];
  return Object.entries(structuredState.sectionMeta)
    .filter(([, meta]) => {
      if (!Number.isFinite(meta.lastUpdatedAt) || meta.lastUpdatedAt <= 0) {
        return false;
      }
      return turnNumber - meta.lastUpdatedAt >= SECTION_STALE_TURNS;
    })
    .map(([key]) => SECTION_LABELS[key] ?? key)
    .slice(0, 4);
}

/** Returns true if the result was applied. */
async function applyPipelineResult(
  data: StateUpdateResponse,
  currentState: string,
  conversationId: string,
  lastTurn: number,
  turnNumber: number,
  onStateUpdate: (s: string, turnNumber?: number) => void,
  onCascadeResets?: (ids: string[]) => void,
  customSegments?: SerializedSegment[] | null,
): Promise<boolean> {
  if (data.newState === currentState || !data.newState.trim()) return false;

  const disposition =
    data.disposition === "retried" ? ("flagged" as const) : data.disposition;

  if (disposition === "auto_accepted" || disposition === "flagged") {
    onStateUpdate(data.newState, data.turnNumber);
  }

  try {
    await appendStateHistoryEntry(conversationId, {
      id: generateId(),
      timestamp: new Date().toISOString(),
      turnRange: [lastTurn + 1, turnNumber],
      previousState: currentState,
      newState: data.newState,
      extractedFacts: data.extractedFacts,
      validation: data.validation,
      disposition,
    });
  } catch (err) {
    console.warn("⚠ state-pipeline: failed to persist history entry:", err);
  }

  // Apply cascade resets so triggered segments re-inject next turn
  if (onCascadeResets) {
    const dynamicResets = computeCascadeResets(
      data.extractedFacts,
      buildCharacterSegmentLookup(customSegments),
    );
    const merged = new Set<string>([
      ...(data.cascadeResets ?? []),
      ...dynamicResets,
    ]);
    if (merged.size > 0) onCascadeResets([...merged]);
  }

  console.log(
    `🔄 state-pipeline: ${disposition}, ${data.extractedFacts.length} facts, ` +
      `diff ${data.validation.diffPercentage}%`,
  );
  return true;
}

function markPipelineUpdated(
  setHistoryVersion: Dispatch<SetStateAction<number>>,
  setRecentlyUpdated: Dispatch<SetStateAction<boolean>>,
  recentTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  setHistoryVersion((version) => version + 1);
  setRecentlyUpdated(true);
  if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
  recentTimerRef.current = setTimeout(() => setRecentlyUpdated(false), 3000);
}

/**
 * Fire-and-forget state pipeline trigger.
 *
 * After each assistant response completes, fires /api/state-update in the
 * background. Auto-accepted updates are applied silently. Flagged updates
 * are applied but logged in history. The user is never interrupted.
 */
export function useStatePipeline({
  messages,
  isLoading,
  storyState,
  structuredState,
  model,
  conversationId,
  onStateUpdate,
  autoSummarizeInterval,
  onCascadeResets,
  customSegments,
  lastPipelineTurn,
  setLastPipelineTurn,
}: Params) {
  const lastPipelineTurnRef = useRef(lastPipelineTurn);
  lastPipelineTurnRef.current = lastPipelineTurn;
  const inflightRef = useRef(false);
  const storyStateRef = useRef(storyState);
  storyStateRef.current = storyState;
  const modelRef = useRef(model);
  modelRef.current = model;
  const [historyVersion, setHistoryVersion] = useState(0);
  const [recentlyUpdated, setRecentlyUpdated] = useState(false);
  const recentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runPipeline = useCallback(
    async (turnNumber: number) => {
      if (inflightRef.current || !conversationId) return;
      inflightRef.current = true;

      try {
        const res = await fetch("/api/state-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Stale-section hint asks the LLM to re-review long-unupdated sections.
          body: JSON.stringify({
            messages,
            currentStoryState: storyStateRef.current,
            turnNumber,
            lastPipelineTurn: lastPipelineTurnRef.current,
            model: modelRef.current,
            staleSections: computeStaleSections(structuredState, turnNumber),
          }),
        });

        if (!res.ok) {
          console.warn(`⚠ state-pipeline: ${res.status} ${res.statusText}`);
          return;
        }

        const data = (await res.json()) as StateUpdateResponse;
        if (data.error) {
          console.warn(`⚠ state-pipeline: ${data.error}`);
          return;
        }

        const applied = await applyPipelineResult(
          data,
          storyStateRef.current,
          conversationId,
          lastPipelineTurnRef.current,
          turnNumber,
          onStateUpdate,
          onCascadeResets,
          customSegments,
        );
        if (applied)
          markPipelineUpdated(
            setHistoryVersion,
            setRecentlyUpdated,
            recentTimerRef,
          );
        setLastPipelineTurn(turnNumber);
      } catch (err) {
        console.error("state-pipeline error:", err);
      } finally {
        inflightRef.current = false;
      }
    },
    [
      messages,
      structuredState,
      conversationId,
      onStateUpdate,
      onCascadeResets,
      customSegments,
      setLastPipelineTurn,
    ],
  );
  usePipelineCompletionTrigger({
    isLoading,
    messages,
    autoSummarizeInterval,
    lastPipelineTurnRef,
    runPipeline,
  });

  return {
    /** Manually trigger the pipeline for the current turn */
    triggerPipeline: () => {
      const turnNumber = messages.filter((m) => m.role === "user").length;
      if (turnNumber > 0) void runPipeline(turnNumber);
    },
    /** Incremented each time a pipeline result is applied — use to re-read history */
    historyVersion,
    /** True for ~3s after a pipeline update is applied */
    recentlyUpdated,
  };
}
