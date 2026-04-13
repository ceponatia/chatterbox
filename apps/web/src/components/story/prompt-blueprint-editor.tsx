"use client";

import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getDefaultBlueprintContent } from "@/lib/blueprint-defaults";
import { generateId } from "@/lib/storage";
import type {
  PromptBlueprint,
  PromptBlueprintSection,
} from "@/lib/story-project-types";

interface BlueprintFieldProps {
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  isCustomized: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  syncNote?: string;
  placeholder?: string;
}

type GuidedBlueprintField = keyof Omit<
  PromptBlueprint,
  "customSections" | "customizedFields"
>;

function BlueprintField({
  label,
  description,
  value,
  defaultValue,
  isCustomized,
  onChange,
  onReset,
  syncNote,
  placeholder,
}: BlueprintFieldProps) {
  const showReset = value !== defaultValue;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium">{label}</label>
          {isCustomized && (
            <Badge variant="outline" className="text-[10px] uppercase">
              Customized
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showReset && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
              onClick={onReset}
              title="Reset to default"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </Button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{description}</p>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 font-mono text-xs leading-relaxed"
        placeholder={placeholder}
      />
      {syncNote ? (
        <p className="text-[10px] text-muted-foreground">{syncNote}</p>
      ) : null}
    </div>
  );
}

function CustomSectionEditor({
  section,
  isFirst,
  isLast,
  onUpdate: handleUpdate,
  onMoveUp: handleMoveUp,
  onMoveDown: handleMoveDown,
  onDelete: handleDelete,
}: {
  section: PromptBlueprintSection;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (section: PromptBlueprintSection) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="app-editor-card flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <Input
          value={section.label}
          onChange={(event) =>
            handleUpdate({ ...section, label: event.target.value })
          }
          placeholder="Section label"
          className="flex-1 text-xs"
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={isFirst}
            onClick={handleMoveUp}
            title="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={isLast}
            onClick={handleMoveDown}
            title="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive"
            onClick={handleDelete}
            title="Remove section"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <Textarea
        value={section.content}
        onChange={(event) =>
          handleUpdate({ ...section, content: event.target.value })
        }
        placeholder="Section content"
        className="min-h-24 font-mono text-xs leading-relaxed"
      />
    </div>
  );
}

export function PromptBlueprintEditor({
  blueprint,
  onChange,
}: {
  blueprint: PromptBlueprint | null;
  onChange: (blueprint: PromptBlueprint) => void;
}) {
  const defaults = getDefaultBlueprintContent();
  const bp = blueprint ?? defaults;
  const customized = bp.customizedFields ?? {};

  function handleFieldChange(field: GuidedBlueprintField) {
    return (value: string) =>
      onChange({
        ...bp,
        [field]: value,
        customizedFields: { ...customized, [field]: true },
      });
  }

  function handleFieldReset(field: GuidedBlueprintField) {
    return () =>
      onChange({
        ...bp,
        [field]: defaults[field],
        customizedFields: { ...customized, [field]: false },
      });
  }

  function updateCustomSection(index: number, section: PromptBlueprintSection) {
    const next = [...bp.customSections];
    next[index] = section;
    onChange({ ...bp, customSections: next });
  }

  function addCustomSection() {
    const nextOrder =
      bp.customSections.length > 0
        ? Math.max(...bp.customSections.map((s) => s.order)) + 1
        : 0;
    onChange({
      ...bp,
      customSections: [
        ...bp.customSections,
        {
          id: `custom_${generateId().slice(0, 8)}`,
          label: "",
          content: "",
          order: nextOrder,
        },
      ],
    });
  }

  function removeCustomSection(index: number) {
    onChange({
      ...bp,
      customSections: bp.customSections.filter((_, i) => i !== index),
    });
  }

  function moveCustomSection(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= bp.customSections.length) return;
    const next = [...bp.customSections];
    const temp = next[index]!;
    next[index] = next[targetIndex]!;
    next[targetIndex] = temp;
    next.forEach((section, i) => {
      section.order = i;
    });
    onChange({ ...bp, customSections: next });
  }

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">Prompt Blueprint</h2>
        <p className="app-editor-summary">
          Define the building blocks that compose your system prompt.
        </p>
      </div>

      <div className="app-editor-card flex flex-col gap-4 p-4">
        <div>
          <h3 className="text-xs font-semibold">Story Context</h3>
          <p className="text-[10px] text-muted-foreground">
            Setting and themes that frame the story for the model.
          </p>
        </div>

        <BlueprintField
          label="Setting"
          description="The story's world, setting, and scenario description."
          value={bp.setting}
          defaultValue={defaults.setting}
          isCustomized={customized.setting === true}
          onChange={handleFieldChange("setting")}
          onReset={handleFieldReset("setting")}
          syncNote={
            customized.setting ? undefined : "Synced from Overview description"
          }
        />

        <BlueprintField
          label="Themes"
          description="Narrative themes the model should keep in view."
          value={bp.themes}
          defaultValue={defaults.themes}
          isCustomized={customized.themes === true}
          onChange={handleFieldChange("themes")}
          onReset={handleFieldReset("themes")}
          placeholder="Narrative themes the model should keep in view. Example: romance, adventure, slow-burn tension, comedy."
        />
      </div>

      <BlueprintField
        label="Core Rules"
        description="Fundamental rules the model must follow."
        value={bp.coreRules}
        defaultValue={defaults.coreRules}
        isCustomized={customized.coreRules ?? false}
        onChange={handleFieldChange("coreRules")}
        onReset={handleFieldReset("coreRules")}
      />

      <BlueprintField
        label="Output Format"
        description="Instructions for how the model should format its responses."
        value={bp.outputFormat}
        defaultValue={defaults.outputFormat}
        isCustomized={customized.outputFormat ?? false}
        onChange={handleFieldChange("outputFormat")}
        onReset={handleFieldReset("outputFormat")}
      />

      <BlueprintField
        label="NPC Framing"
        description="How NPCs should be introduced, voiced, and framed."
        value={bp.npcFraming}
        defaultValue={defaults.npcFraming}
        isCustomized={customized.npcFraming ?? false}
        onChange={handleFieldChange("npcFraming")}
        onReset={handleFieldReset("npcFraming")}
      />

      <BlueprintField
        label="Narration Guidelines"
        description="Guidelines for pacing, narration style, and scene progression."
        value={bp.narrationGuidelines}
        defaultValue={defaults.narrationGuidelines}
        isCustomized={customized.narrationGuidelines ?? false}
        onChange={handleFieldChange("narrationGuidelines")}
        onReset={handleFieldReset("narrationGuidelines")}
      />

      <BlueprintField
        label="Interaction Guidelines"
        description="How the character should interact with the player."
        value={bp.interactionGuidelines}
        defaultValue={defaults.interactionGuidelines}
        isCustomized={customized.interactionGuidelines ?? false}
        onChange={handleFieldChange("interactionGuidelines")}
        onReset={handleFieldReset("interactionGuidelines")}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold">Custom Sections</h3>
            <p className="text-[10px] text-muted-foreground">
              Freeform sections added to the system prompt.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={addCustomSection}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        {bp.customSections.map((section, index) => (
          <CustomSectionEditor
            key={section.id}
            section={section}
            isFirst={index === 0}
            isLast={index === bp.customSections.length - 1}
            onUpdate={(updated) => updateCustomSection(index, updated)}
            onMoveUp={() => moveCustomSection(index, -1)}
            onMoveDown={() => moveCustomSection(index, 1)}
            onDelete={() => removeCustomSection(index)}
          />
        ))}
      </div>
    </div>
  );
}
