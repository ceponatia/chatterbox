"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Star, Save, Trash2 } from "lucide-react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/defaults";
import { MODEL_REGISTRY } from "@/lib/model-registry";
import { usePresets } from "@/lib/hooks/use-presets";

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

function PresetDropdown({
  presets,
  activePresetId,
  isModified,
  loading,
  onSelect,
}: {
  presets: { id: string; name: string; isDefault: boolean }[];
  activePresetId: string | null;
  isModified: boolean;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={activePresetId ?? ""}
        onValueChange={(value) => {
          if (value) onSelect(value);
        }}
        disabled={loading || presets.length === 0}
      >
        <SelectTrigger className="h-8 text-xs flex-1">
          <SelectValue
            placeholder={
              loading
                ? "Loading..."
                : presets.length === 0
                  ? "No presets"
                  : "Select preset..."
            }
          />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              <span className="flex items-center gap-1">
                {preset.isDefault && (
                  <Star className="h-3 w-3 fill-current text-yellow-500" />
                )}
                {preset.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isModified && (
        <Badge variant="outline" className="text-[10px] shrink-0">
          Modified
        </Badge>
      )}
    </div>
  );
}

function SaveAsInput({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-1 w-full">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name"
        className="h-6 text-xs flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onSave(name.trim());
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] px-2"
        onClick={() => name.trim() && onSave(name.trim())}
        disabled={!name.trim()}
      >
        Save
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] px-2"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

function PresetActions({
  activePresetId,
  activeIsDefault,
  isModified,
  onSaveAs,
  onUpdate,
  onSetDefault,
  onDelete,
}: {
  activePresetId: string | null;
  activeIsDefault: boolean;
  isModified: boolean;
  onSaveAs: (name: string) => void;
  onUpdate: () => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showNameInput, setShowNameInput] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-1">
      {!showNameInput ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] px-2"
          onClick={() => setShowNameInput(true)}
        >
          <Save className="mr-1 h-3 w-3" /> Save as New
        </Button>
      ) : (
        <SaveAsInput
          onSave={(name) => {
            onSaveAs(name);
            setShowNameInput(false);
          }}
          onCancel={() => setShowNameInput(false)}
        />
      )}

      {activePresetId && isModified && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] px-2"
          onClick={onUpdate}
        >
          Update
        </Button>
      )}

      {activePresetId && !activeIsDefault && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] px-2"
          onClick={() => onSetDefault(activePresetId)}
        >
          <Star className="mr-1 h-3 w-3" /> Set Default
        </Button>
      )}

      {activePresetId &&
        (confirmDeleteId === activePresetId ? (
          <div className="flex items-center gap-1">
            <Button
              variant="destructive"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                onDelete(activePresetId);
                setConfirmDeleteId(null);
              }}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 text-destructive"
            onClick={() => setConfirmDeleteId(activePresetId)}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
        ))}
    </div>
  );
}

function PresetSelector({
  presets,
  activePresetId,
  isModified,
  loading,
  onSelect,
  onSaveAs,
  onUpdate,
  onSetDefault,
  onDelete,
}: {
  presets: { id: string; name: string; isDefault: boolean }[];
  activePresetId: string | null;
  isModified: boolean;
  loading: boolean;
  onSelect: (id: string) => void;
  onSaveAs: (name: string) => void;
  onUpdate: () => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const activePreset = presets.find((p) => p.id === activePresetId);

  return (
    <div className="space-y-2">
      <Label className="text-xs">Presets</Label>
      <PresetDropdown
        presets={presets}
        activePresetId={activePresetId}
        isModified={isModified}
        loading={loading}
        onSelect={onSelect}
      />
      <PresetActions
        activePresetId={activePresetId}
        activeIsDefault={activePreset?.isDefault ?? false}
        isModified={isModified}
        onSaveAs={onSaveAs}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
        onDelete={onDelete}
      />
    </div>
  );
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const preset = usePresets(settings, onChange);
  const update = (partial: Partial<Settings>) =>
    onChange({ ...settings, ...partial });

  const handleReset = () => {
    preset.clearActivePreset();
    onChange(DEFAULT_SETTINGS);
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader onReset={handleReset} />
      <PresetSelector
        presets={preset.presets}
        activePresetId={preset.activePresetId}
        isModified={preset.isModified}
        loading={preset.loading}
        onSelect={preset.selectPreset}
        onSaveAs={preset.saveAsPreset}
        onUpdate={preset.updatePreset}
        onSetDefault={preset.setDefault}
        onDelete={preset.deletePreset}
      />
      <SettingsFields settings={settings} update={update} />
    </div>
  );
}
