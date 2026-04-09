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
  onChange: (value: number) => void;
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
        onValueChange={([nextValue]) => {
          if (nextValue !== undefined) onChange(nextValue);
        }}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

function SettingsHeader({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-semibold">Model Settings</Label>
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        title="Reset to defaults"
      >
        <RotateCcw className="mr-1 h-3 w-3" /> Reset
      </Button>
    </div>
  );
}

function ModelField({
  model,
  onChange,
}: {
  model: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Model</Label>
      <Select value={model} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODEL_REGISTRY.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {model === "aion-labs/aion-2.0" && (
        <p className="app-warning-note">
          <Info className="h-3 w-3 shrink-0" />
          Tools provided by GLM 5
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(parseInt(event.target.value) || min)}
        min={min}
        max={max}
        className="h-8 text-xs"
      />
    </div>
  );
}

function TokenBudgetField({
  value,
  onChange,
  onBlur,
}: {
  value: number;
  onChange: (value: number) => void;
  onBlur: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Prompt Token Budget</Label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(parseInt(event.target.value) || 0)}
        onBlur={onBlur}
        min={500}
        max={10000}
        className="h-8 text-xs"
      />
      <p className="text-[10px] text-muted-foreground">
        Max tokens for the segmented system prompt (excludes story state). Lower
        values drop more segments.
      </p>
    </div>
  );
}

function SettingsFields({
  settings,
  update,
}: {
  settings: Settings;
  update: (partial: Partial<Settings>) => void;
}) {
  return (
    <>
      <ModelField
        model={settings.model}
        onChange={(model) => update({ model })}
      />
      <SliderField
        label="Temperature"
        value={settings.temperature}
        onChange={(temperature) => update({ temperature })}
        min={0}
        max={2}
        step={0.05}
      />
      <NumberField
        label="Max Tokens"
        value={settings.maxTokens}
        min={1}
        max={131000}
        onChange={(maxTokens) => update({ maxTokens: Math.max(1, maxTokens) })}
      />
      <SliderField
        label="Top P"
        value={settings.topP}
        onChange={(topP) => update({ topP })}
        min={0}
        max={1}
        step={0.05}
      />
      <SliderField
        label="Frequency Penalty"
        value={settings.frequencyPenalty}
        onChange={(frequencyPenalty) => update({ frequencyPenalty })}
        min={-2}
        max={2}
        step={0.1}
      />
      <SliderField
        label="Presence Penalty"
        value={settings.presencePenalty}
        onChange={(presencePenalty) => update({ presencePenalty })}
        min={-2}
        max={2}
        step={0.1}
      />
      <NumberField
        label="Auto-Summarize Interval (turns)"
        value={settings.autoSummarizeInterval}
        min={5}
        max={100}
        onChange={(autoSummarizeInterval) =>
          update({
            autoSummarizeInterval: Math.max(5, autoSummarizeInterval || 15),
          })
        }
      />
      <TokenBudgetField
        value={settings.tokenBudget}
        onChange={(tokenBudget) => update({ tokenBudget })}
        onBlur={() =>
          update({
            tokenBudget: Math.min(10000, Math.max(500, settings.tokenBudget)),
          })
        }
      />
    </>
  );
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = (partial: Partial<Settings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader onReset={() => onChange(DEFAULT_SETTINGS)} />
      <SettingsFields settings={settings} update={update} />
    </div>
  );
}
