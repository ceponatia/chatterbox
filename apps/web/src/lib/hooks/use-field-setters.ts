"use client";

import { useState, useCallback, useRef } from "react";
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
  remapEntityIds,
} from "@/lib/story-state-model";

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

  const storyStateRef = useRef(storyState);
  storyStateRef.current = storyState;

  const updateStoryStateFromSummary = useCallback((newState: string) => {
    setPreviousStoryState(storyStateRef.current);
    const incoming = parseMarkdownToStructured(newState);
    setStructuredState((prev) => {
      const existingEntities = prev?.entities ?? [];
      const { entities, idRemap } = reconcileEntities(
        existingEntities,
        incoming.entities,
      );
      const remapped = remapEntityIds({ ...incoming, entities }, idRemap);
      setStoryState(structuredToMarkdown(remapped));
      return remapped;
    });
    setStoryStateLastUpdated(new Date().toISOString());
  }, []);

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

export function useFieldSetters() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptTouched, setSystemPromptTouched] = useState(false);
  const [systemPromptBaseline, setSystemPromptBaseline] = useState<
    string | null
  >(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lastIncludedAt, setLastIncludedAt] = useState<Record<string, number>>(
    {},
  );
  const [customSegments, setCustomSegments] = useState<
    SerializedSegment[] | null
  >(null);
  const [lastSummarizedTurn, setLastSummarizedTurn] = useState(0);
  const [lastPipelineTurn, setLastPipelineTurn] = useState(0);

  const story = useStoryStateHandlers();

  const handleSystemPromptChange = useCallback((value: string) => {
    setSystemPrompt(value);
    setSystemPromptTouched(true);
  }, []);

  const handleSystemPromptImport = useCallback((content: string) => {
    const segments = parseSystemPromptToSegments(content);
    setCustomSegments(segments);
    setSystemPrompt(segmentsToMarkdown(segments));
    setSystemPromptBaseline(content);
    setSystemPromptTouched(true);
  }, []);

  const resetInputTouchFlags = useCallback(() => {
    story.setStoryStateTouched(false);
    setSystemPromptTouched(false);
  }, [story]);

  const handleSystemPromptReset = useCallback(() => {
    if (systemPromptBaseline !== null) {
      const segments = parseSystemPromptToSegments(systemPromptBaseline);
      setCustomSegments(segments);
      setSystemPrompt(segmentsToMarkdown(segments));
    }
  }, [systemPromptBaseline]);

  const handleSegmentUpdate = useCallback(
    (segmentId: string, newContent: string) => {
      setCustomSegments((prev) => {
        if (!prev) return prev;
        return prev.map((s) =>
          s.id === segmentId
            ? {
                ...s,
                content: newContent,
                tokenEstimate: Math.ceil(newContent.length / 4),
              }
            : s,
        );
      });
    },
    [],
  );

  const handleSettingsChange = useCallback((value: Settings) => {
    setSettings(value);
  }, []);

  return {
    ...story,
    systemPrompt,
    setSystemPrompt,
    systemPromptTouched,
    setSystemPromptTouched,
    systemPromptBaseline,
    setSystemPromptBaseline,
    settings,
    setSettings,
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
    handleSystemPromptReset,
    handleSegmentUpdate,
    handleSettingsChange,
    resetInputTouchFlags,
  };
}
