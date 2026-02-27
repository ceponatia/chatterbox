"use client";

import { useState, useCallback } from "react";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { Settings } from "@/lib/defaults";

export function useFieldSetters() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [storyState, setStoryState] = useState("");
  const [systemPromptBaseline, setSystemPromptBaseline] = useState<string | null>(null);
  const [storyStateBaseline, setStoryStateBaseline] = useState<string | null>(null);
  const [storyStateLastUpdated, setStoryStateLastUpdated] = useState<string | null>(null);
  const [previousStoryState, setPreviousStoryState] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const handleSystemPromptChange = useCallback((value: string) => {
    setSystemPrompt(value);
  }, []);

  const handleStoryStateChange = useCallback((value: string) => {
    setStoryState(value);
  }, []);

  const handleStoryStateImport = useCallback((content: string) => {
    setStoryState(content);
    setStoryStateBaseline(content);
  }, []);

  const handleStoryStateReset = useCallback(() => {
    if (storyStateBaseline !== null) {
      setStoryState(storyStateBaseline);
    }
  }, [storyStateBaseline]);

  const handleSystemPromptImport = useCallback((content: string) => {
    setSystemPrompt(content);
    setSystemPromptBaseline(content);
  }, []);

  const handleSystemPromptReset = useCallback(() => {
    if (systemPromptBaseline !== null) {
      setSystemPrompt(systemPromptBaseline);
    }
  }, [systemPromptBaseline]);

  const handleSettingsChange = useCallback((value: Settings) => {
    setSettings(value);
  }, []);

  const updateStoryStateFromSummary = useCallback(
    (newState: string) => {
      setPreviousStoryState(storyState);
      setStoryState(newState);
      setStoryStateLastUpdated(new Date().toISOString());
    },
    [storyState]
  );

  return {
    systemPrompt, setSystemPrompt,
    storyState, setStoryState,
    systemPromptBaseline, setSystemPromptBaseline,
    storyStateBaseline, setStoryStateBaseline,
    storyStateLastUpdated, setStoryStateLastUpdated,
    previousStoryState, setPreviousStoryState,
    settings, setSettings,
    handleSystemPromptChange,
    handleStoryStateChange,
    handleStoryStateImport,
    handleStoryStateReset,
    handleSystemPromptImport,
    handleSystemPromptReset,
    handleSettingsChange,
    updateStoryStateFromSummary,
  };
}
