"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  PromptBlueprint,
  PromptBlueprintSection,
} from "@/lib/story-project-types";

const EMPTY_BLUEPRINT: PromptBlueprint = {
  coreRulesAdditions: "",
  outputFormat: "",
  settingScenario: "",
  npcFraming: "",
  interactionGuidelines: "",
  customSections: [],
};

interface BlueprintFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}

function BlueprintField({
  label,
  description,
  value,
  onChange,
}: BlueprintFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      <p className="text-[10px] text-muted-foreground">{description}</p>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 font-mono text-xs leading-relaxed"
      />
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
  const bp = blueprint ?? EMPTY_BLUEPRINT;

  function updateField(field: keyof Omit<PromptBlueprint, "customSections">) {
    return (value: string) => onChange({ ...bp, [field]: value });
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
          id: `custom_${crypto.randomUUID().slice(0, 8)}`,
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

      <BlueprintField
        label="Core Rules Additions"
        description="Additional rules layered on top of the default core rules."
        value={bp.coreRulesAdditions}
        onChange={updateField("coreRulesAdditions")}
      />

      <BlueprintField
        label="Output Format"
        description="Instructions for how the model should format its responses."
        value={bp.outputFormat}
        onChange={updateField("outputFormat")}
      />

      <BlueprintField
        label="Setting / Scenario"
        description="The story's world, setting, and scenario description."
        value={bp.settingScenario}
        onChange={updateField("settingScenario")}
      />

      <BlueprintField
        label="NPC Framing"
        description="How NPCs should be introduced, voiced, and framed."
        value={bp.npcFraming}
        onChange={updateField("npcFraming")}
      />

      <BlueprintField
        label="Interaction Guidelines"
        description="How the character should interact with the player."
        value={bp.interactionGuidelines}
        onChange={updateField("interactionGuidelines")}
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
