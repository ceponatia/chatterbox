"use client";

import { useState } from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  SYSTEM_PROMPT_SECTIONS,
  type PromptFieldDefinition,
  type PromptSectionDefinition,
} from "@/lib/system-prompt-schema";
import type { SegmentOverrides } from "@/lib/story-project-types";

function PromptFieldEditor({
  field,
  value,
  onChange,
  onReset,
}: {
  field: PromptFieldDefinition;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const isDefault = value === field.defaultContent;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium" title={field.tooltip}>
          {field.label}
        </label>
        {!isDefault && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={onReset}
            title="Reset to default"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        title={field.tooltip}
        className="min-h-36 font-mono text-xs leading-relaxed"
      />
      {!isDefault && (
        <span className="text-[10px] text-muted-foreground">Customized</span>
      )}
    </div>
  );
}

function PromptSection({
  section,
  overrides,
  onFieldChange,
  onFieldReset,
}: {
  section: PromptSectionDefinition;
  overrides: SegmentOverrides;
  onFieldChange: (key: string, value: string) => void;
  onFieldReset: (key: string) => void;
}) {
  const [open, setOpen] = useState(!section.collapsed);

  const hasCustomizations = section.fields.some((field) => {
    const current = overrides[field.key];
    return current !== undefined && current !== field.defaultContent;
  });

  return (
    <CollapsiblePrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="app-editor-section">
        <CollapsiblePrimitive.Trigger asChild={true}>
          <button type="button" className="app-editor-section-trigger">
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 text-left">
              <span className="text-sm font-medium">{section.label}</span>
              <span className="block text-[10px] text-muted-foreground">
                {section.description}
              </span>
            </span>
            {hasCustomizations && <Badge variant="outline">edited</Badge>}
          </button>
        </CollapsiblePrimitive.Trigger>
        <CollapsiblePrimitive.Content className="app-editor-section-body">
          <div className="flex flex-col gap-4">
            {section.fields.map((field) => (
              <PromptFieldEditor
                key={field.key}
                field={field}
                value={overrides[field.key] ?? field.defaultContent}
                onChange={(value) => onFieldChange(field.key, value)}
                onReset={() => onFieldReset(field.key)}
              />
            ))}
          </div>
        </CollapsiblePrimitive.Content>
      </div>
    </CollapsiblePrimitive.Root>
  );
}

export function SystemPromptEditor({
  overrides,
  onOverridesChange,
}: {
  overrides: SegmentOverrides;
  onOverridesChange: (overrides: SegmentOverrides) => void;
}) {
  function handleFieldChange(key: string, value: string) {
    onOverridesChange({ ...overrides, [key]: value });
  }

  function handleFieldReset(key: string) {
    const field = SYSTEM_PROMPT_SECTIONS.flatMap(
      (section) => section.fields,
    ).find((f) => f.key === key);
    if (field) {
      onOverridesChange({ ...overrides, [key]: field.defaultContent });
    }
  }

  return (
    <div className="app-story-card app-story-stack">
      <div>
        <h2 className="text-sm font-semibold">System Prompt</h2>
        <p className="app-editor-summary">
          Customize how the narrator behaves. Uses{" "}
          <code className="text-[10px]">{"{{ char }}"}</code> and{" "}
          <code className="text-[10px]">{"{{ user }}"}</code> as placeholders.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {SYSTEM_PROMPT_SECTIONS.map((section) => (
          <PromptSection
            key={section.id}
            section={section}
            overrides={overrides}
            onFieldChange={handleFieldChange}
            onFieldReset={handleFieldReset}
          />
        ))}
      </div>
    </div>
  );
}
