import type { Settings } from "@/lib/defaults";

export interface SettingsPreset {
  id: string;
  name: string;
  settings: Settings;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
