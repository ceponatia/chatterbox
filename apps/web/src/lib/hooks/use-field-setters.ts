"use client";

import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import {
  parseSystemPromptToSegments,
  segmentsToMarkdown,
} from "@chatterbox/prompt-assembly";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { Settings } from "@/lib/defaults";
import type { StructuredStoryState } from "@/lib/story-state-model";
import {
  parseMarkdownToStructured,
  structuredToMarkdown,
  reconcileEntities,
  reconcileLifecycleState,
  remapEntityIds,
  applySectionMetaTransition,
} from "@/lib/story-state-model";
import { buildCharacterBehaviorSegment } from "@/lib/character-markdown";

/** Story-state-specific handlers (extracted to keep main hook under line limit). */
function useStoryStateHandlers() {
  const [storyState, setStoryState] = useState("");
  const [storyStateTouched, setStoryStateTouched] = useState(false);
  const [storyStateBaseline, setStoryStateBaseline] = useState<string | null>(
    null,
  );
  const [storyStateLastUpdated, setStoryStateLastUpdated] = useState<
    string | null
  >(null);
  const [previousStoryState, setPreviousStoryState] = useState<string | null>(
    null,
  );
  const [structuredState, setStructuredState] =
    useState<StructuredStoryState | null>(null);

  const handleStoryStateChange = useCallback((value: string) => {
    setStoryState(value);
    setStoryStateTouched(true);
    setStructuredState(null);
  }, []);

  const handleStoryStateImport = useCallback((content: string) => {
    const structured = parseMarkdownToStructured(content);
    setStructuredState(structured);
    setStoryState(structuredToMarkdown(structured));
    setStoryStateBaseline(content);
    setStoryStateTouched(true);
  }, []);

  const handleStoryStateReset = useCallback(() => {
    if (storyStateBaseline !== null) {
      const structured = parseMarkdownToStructured(storyStateBaseline);
      setStructuredState(structured);
      setStoryState(structuredToMarkdown(structured));
    }
  }, [storyStateBaseline]);

  const handleStructuredStateUpdate = useCallback(
    (updated: StructuredStoryState, onError?: () => void) => {
      setStructuredState(updated);
      try {
        setStoryState(structuredToMarkdown(updated));
      } catch (err) {
        console.error("Failed to serialize structured state to markdown:", err);
        onError?.();
      }
    },
    [],
  );

  const updateStoryStateFromSummary = useCallback(
    (newState: string, turnNumber?: number) => {
      setPreviousStoryState(storyState);
      const incoming = parseMarkdownToStructured(newState);
      setStructuredState((prev) => {
        const existingEntities = prev?.entities ?? [];
        const { entities, idRemap } = reconcileEntities(
          existingEntities,
          incoming.entities,
        );
        const remapped = remapEntityIds({ ...incoming, entities }, idRemap);
        const reconciled = reconcileLifecycleState(prev, remapped);
        const withSectionMeta = applySectionMetaTransition(
          prev,
          reconciled,
          turnNumber ?? 0,
        );
        setStoryState(structuredToMarkdown(withSectionMeta));
        return withSectionMeta;
      });
      setStoryStateLastUpdated(new Date().toISOString());
    },
    [storyState],
  );

  return {
    storyState,
    setStoryState,
    storyStateTouched,
    setStoryStateTouched,
    storyStateBaseline,
    setStoryStateBaseline,
    storyStateLastUpdated,
    setStoryStateLastUpdated,
    previousStoryState,
    setPreviousStoryState,
    structuredState,
    setStructuredState,
    handleStoryStateChange,
    handleStoryStateImport,
    handleStoryStateReset,
    handleStructuredStateUpdate,
    updateStoryStateFromSummary,
  };
}

function syncPromptFromSegments(
  segments: SerializedSegment[],
  setSystemPrompt: Dispatch<SetStateAction<string>>,
  setSystemPromptTouched: Dispatch<SetStateAction<boolean>>,
) {
  setSystemPrompt(segmentsToMarkdown(segments));
  setSystemPromptTouched(true);
}

function usePromptAssemblyState() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptTouched, setSystemPromptTouched] = useState(false);
  const [systemPromptBaseline, setSystemPromptBaseline] = useState<
    string | null
  >(null);
  const [lastIncludedAt, setLastIncludedAt] = useState<Record<string, number>>(
    {},
  );
  const [customSegments, setCustomSegments] = useState<
    SerializedSegment[] | null
  >(null);
  const [lastSummarizedTurn, setLastSummarizedTurn] = useState(0);
  const [lastPipelineTurn, setLastPipelineTurn] = useState(0);

  const handleSystemPromptChange = useCallback((value: string) => {
    setSystemPrompt(value);
    setSystemPromptTouched(true);
  }, []);

  const handleSystemPromptImport = useCallback((content: string) => {
    const segments = parseSystemPromptToSegments(content);
    setCustomSegments(segments);
    syncPromptFromSegments(segments, setSystemPrompt, setSystemPromptTouched);
    setSystemPromptBaseline(content);
  }, []);

  const handleCharacterFileImport = useCallback(
    (content: string, entityId: string, entityName: string) => {
      const nextSegment = buildCharacterBehaviorSegment(
        content,
        entityId,
        entityName,
      );
      if (!nextSegment) return;

      setCustomSegments((prev) => {
        const base = prev ?? parseSystemPromptToSegments(systemPrompt);
        const index = base.findIndex(
          (segment) => segment.id === nextSegment.id,
        );
        const next = [...base];
        if (index >= 0) next[index] = nextSegment;
        else next.push(nextSegment);

        syncPromptFromSegments(next, setSystemPrompt, setSystemPromptTouched);
        return next;
      });
    },
    [systemPrompt],
  );

  const handleSystemPromptReset = useCallback(() => {
    if (systemPromptBaseline === null) return;
    const segments = parseSystemPromptToSegments(systemPromptBaseline);
    setCustomSegments(segments);
    setSystemPrompt(segmentsToMarkdown(segments));
  }, [systemPromptBaseline]);

  const handleSegmentUpdate = useCallback(
    (
      segmentId: string,
      patch: { content?: string; omittedSummary?: string },
    ) => {
      setCustomSegments((prev) => {
        if (!prev) return prev;
        return prev.map((segment) =>
          segment.id === segmentId
            ? {
                ...segment,
                content: patch.content ?? segment.content,
                tokenEstimate: Math.ceil(
                  (patch.content ?? segment.content).length / 4,
                ),
                omittedSummary:
                  patch.omittedSummary !== undefined
                    ? patch.omittedSummary
                    : segment.omittedSummary,
              }
            : segment,
        );
      });
    },
    [],
  );

  return {
    systemPrompt,
    setSystemPrompt,
    systemPromptTouched,
    setSystemPromptTouched,
    systemPromptBaseline,
    setSystemPromptBaseline,
    lastIncludedAt,
    setLastIncludedAt,
    customSegments,
    setCustomSegments,
    lastSummarizedTurn,
    setLastSummarizedTurn,
    lastPipelineTurn,
    setLastPipelineTurn,
    handleSystemPromptChange,
    handleSystemPromptImport,
    handleCharacterFileImport,
    handleSystemPromptReset,
    handleSegmentUpdate,
  };
}

export function useFieldSetters() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const story = useStoryStateHandlers();
  const prompt = usePromptAssemblyState();

  const resetInputTouchFlags = useCallback(() => {
    story.setStoryStateTouched(false);
    prompt.setSystemPromptTouched(false);
  }, [prompt, story]);

  const handleSettingsChange = useCallback((value: Settings) => {
    setSettings(value);
  }, []);

  return {
    ...story,
    ...prompt,
    settings,
    setSettings,
    handleSettingsChange,
    resetInputTouchFlags,
  };
}
