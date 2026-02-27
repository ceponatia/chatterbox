"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/defaults";

interface SettingsPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

function SliderField({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => { if (v !== undefined) onChange(v); }} min={min} max={max} step={step} />
    </div>
  );
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = (partial: Partial<Settings>) => onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Model Settings</Label>
        <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_SETTINGS)} title="Reset to defaults">
          <RotateCcw className="mr-1 h-3 w-3" /> Reset
        </Button>
      </div>

      <SliderField label="Temperature" value={settings.temperature} onChange={(v) => update({ temperature: v })} min={0} max={2} step={0.05} />

      <div className="space-y-2">
        <Label className="text-xs">Max Tokens</Label>
        <Input type="number" value={settings.maxTokens}
          onChange={(e) => update({ maxTokens: Math.max(1, parseInt(e.target.value) || 1) })}
          min={1} max={131000} className="h-8 text-xs" />
      </div>

      <SliderField label="Top P" value={settings.topP} onChange={(v) => update({ topP: v })} min={0} max={1} step={0.05} />
      <SliderField label="Frequency Penalty" value={settings.frequencyPenalty} onChange={(v) => update({ frequencyPenalty: v })} min={-2} max={2} step={0.1} />
      <SliderField label="Presence Penalty" value={settings.presencePenalty} onChange={(v) => update({ presencePenalty: v })} min={-2} max={2} step={0.1} />

      <div className="space-y-2">
        <Label className="text-xs">Auto-Summarize Interval (turns)</Label>
        <Input type="number" value={settings.autoSummarizeInterval}
          onChange={(e) => update({ autoSummarizeInterval: Math.max(5, parseInt(e.target.value) || 15) })}
          min={5} max={100} className="h-8 text-xs" />
      </div>
    </div>
  );
}
