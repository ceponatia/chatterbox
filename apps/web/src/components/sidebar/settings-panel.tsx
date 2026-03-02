"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RotateCcw, Info } from "lucide-react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/defaults";
import { MODEL_REGISTRY } from "@/lib/model-registry";

interface SettingsPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => {
          if (v !== undefined) onChange(v);
        }}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = (partial: Partial<Settings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Model Settings</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(DEFAULT_SETTINGS)}
          title="Reset to defaults"
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Reset
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Model</Label>
        <Select
          value={settings.model}
          onValueChange={(v) => update({ model: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_REGISTRY.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {settings.model === "aion-labs/aion-2.0" && (
          <p className="flex items-center gap-1 text-[10px] text-amber-400">
            <Info className="h-3 w-3 shrink-0" />
            Tools provided by GLM 5
          </p>
        )}
      </div>

      <SliderField
        label="Temperature"
        value={settings.temperature}
        onChange={(v) => update({ temperature: v })}
        min={0}
        max={2}
        step={0.05}
      />

      <div className="space-y-2">
        <Label className="text-xs">Max Tokens</Label>
        <Input
          type="number"
          value={settings.maxTokens}
          onChange={(e) =>
            update({ maxTokens: Math.max(1, parseInt(e.target.value) || 1) })
          }
          min={1}
          max={131000}
          className="h-8 text-xs"
        />
      </div>

      <SliderField
        label="Top P"
        value={settings.topP}
        onChange={(v) => update({ topP: v })}
        min={0}
        max={1}
        step={0.05}
      />
      <SliderField
        label="Frequency Penalty"
        value={settings.frequencyPenalty}
        onChange={(v) => update({ frequencyPenalty: v })}
        min={-2}
        max={2}
        step={0.1}
      />
      <SliderField
        label="Presence Penalty"
        value={settings.presencePenalty}
        onChange={(v) => update({ presencePenalty: v })}
        min={-2}
        max={2}
        step={0.1}
      />

      <div className="space-y-2">
        <Label className="text-xs">Auto-Summarize Interval (turns)</Label>
        <Input
          type="number"
          value={settings.autoSummarizeInterval}
          onChange={(e) =>
            update({
              autoSummarizeInterval: Math.max(
                5,
                parseInt(e.target.value) || 15,
              ),
            })
          }
          min={5}
          max={100}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Prompt Token Budget</Label>
        <Input
          type="number"
          value={settings.tokenBudget}
          onChange={(e) =>
            update({ tokenBudget: parseInt(e.target.value) || 0 })
          }
          onBlur={() =>
            update({
              tokenBudget: Math.min(10000, Math.max(500, settings.tokenBudget)),
            })
          }
          min={500}
          max={10000}
          className="h-8 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Max tokens for the segmented system prompt (excludes story state).
          Lower values drop more segments.
        </p>
      </div>
    </div>
  );
}
