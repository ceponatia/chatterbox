"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "@/lib/defaults";
import type { SettingsPreset } from "@/lib/preset-types";
import {
  listPresets,
  createPreset,
  updatePreset as apiUpdatePreset,
  deletePreset as apiDeletePreset,
} from "@/lib/preset-client";

export function usePresets(
  settings: Settings,
  onChange: (settings: Settings) => void,
) {
  const [presets, setPresets] = useState<SettingsPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const refresh = useCallback(async () => {
    try {
      const list = await listPresets();
      setPresets(list);
    } catch (err) {
      console.error("Failed to load presets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;
  const isModified =
    activePreset !== null &&
    JSON.stringify(settings) !== JSON.stringify(activePreset.settings);

  const selectPreset = useCallback(
    (id: string) => {
      const preset = presets.find((p) => p.id === id);
      if (!preset) return;
      setActivePresetId(id);
      onChangeRef.current(preset.settings);
    },
    [presets],
  );

  const saveAsPreset = useCallback(
    async (name: string) => {
      const created = await createPreset({ name, settings });
      setActivePresetId(created.id);
      await refresh();
    },
    [settings, refresh],
  );

  const updatePreset = useCallback(async () => {
    if (!activePresetId) return;
    await apiUpdatePreset(activePresetId, { settings });
    await refresh();
  }, [activePresetId, settings, refresh]);

  const deletePreset = useCallback(
    async (id: string) => {
      await apiDeletePreset(id);
      if (activePresetId === id) setActivePresetId(null);
      await refresh();
    },
    [activePresetId, refresh],
  );

  const clearActivePreset = useCallback(() => {
    setActivePresetId(null);
  }, []);

  const setDefault = useCallback(
    async (id: string) => {
      await apiUpdatePreset(id, { isDefault: true });
      await refresh();
    },
    [refresh],
  );

  return {
    presets,
    loading,
    activePresetId,
    isModified,
    selectPreset,
    saveAsPreset,
    updatePreset,
    deletePreset,
    clearActivePreset,
    setDefault,
    refresh,
  };
}
