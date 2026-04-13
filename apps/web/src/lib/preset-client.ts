"use client";

import type { Settings } from "@/lib/defaults";
import type { SettingsPreset } from "@/lib/preset-types";

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    return new Promise<T>(() => {});
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function listPresets(): Promise<SettingsPreset[]> {
  return requestJson<SettingsPreset[]>("/api/presets");
}

export function createPreset(input: {
  name: string;
  settings: Settings;
  isDefault?: boolean;
}): Promise<SettingsPreset> {
  return requestJson<SettingsPreset>("/api/presets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePreset(
  id: string,
  input: { name?: string; settings?: Settings; isDefault?: boolean },
): Promise<SettingsPreset> {
  return requestJson<SettingsPreset>(`/api/presets/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deletePreset(id: string): Promise<void> {
  return requestJson(`/api/presets/${id}`, { method: "DELETE" });
}
