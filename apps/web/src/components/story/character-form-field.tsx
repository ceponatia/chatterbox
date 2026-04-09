"use client";

import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDefinition } from "@/lib/character-schema";
import {
  KNOWN_APPEARANCE_KEYS,
  PRONOUNS_OPTIONS,
} from "@/lib/character-schema";
import type { CharacterAppearanceEntry } from "@/lib/story-project-types";
import type { CharacterBuilderDraft } from "./use-character-builder";

function PronounsField({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const defaultOptions = PRONOUNS_OPTIONS.filter(
    (option) => option !== "custom",
  );
  const isCustomValue = value.length > 0 && !defaultOptions.includes(value);
  const selectValue = isCustomValue ? "custom" : value;

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={selectValue || undefined}
        onValueChange={(nextValue) => {
          if (nextValue === "custom") {
            onChange("custom");
            return;
          }
          onChange(nextValue);
        }}
      >
        <SelectTrigger title={field.tooltip}>
          <SelectValue placeholder={field.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(selectValue === "custom" || isCustomValue) && (
        <Input
          value={selectValue === "custom" ? "" : value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Custom pronouns"
          title={field.tooltip}
        />
      )}
    </div>
  );
}

function FieldLabel({ field }: { field: FieldDefinition }) {
  return (
    <div className="flex items-center gap-2">
      <span>{field.label}</span>
      {field.required && <Badge variant="outline">Required</Badge>}
    </div>
  );
}

function TextFieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "textarea") {
    return (
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        title={field.tooltip}
        className="min-h-28"
      />
    );
  }

  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      title={field.tooltip}
    />
  );
}

function SelectFieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger title={field.tooltip}>
        <SelectValue placeholder={field.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {field.options?.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AttributeListField({
  attributes,
  onAttributeChange,
  onAddAttribute,
  onRemoveAttribute,
  onMutabilityChange,
}: {
  attributes: CharacterBuilderDraft["appearance"];
  onAttributeChange?: (
    index: number,
    key: "attribute" | "value",
    value: string,
  ) => void;
  onAddAttribute?: () => void;
  onRemoveAttribute?: (index: number) => void;
  onMutabilityChange?: (
    index: number,
    tier: CharacterAppearanceEntry["mutabilityTier"],
  ) => void;
}) {
  return (
    <div className="app-story-stack">
      {attributes.map((entry, index) => {
        const knownMeta = KNOWN_APPEARANCE_KEYS[entry.attribute.toLowerCase()];
        const tier = entry.mutabilityTier ?? knownMeta?.mutabilityTier;
        return (
          <div key={index} className="app-editor-card gap-3">
            <div className="flex items-start gap-3">
              <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,0.3fr)_minmax(0,0.7fr)]">
                <Input
                  value={entry.attribute}
                  onChange={(event) =>
                    onAttributeChange?.(index, "attribute", event.target.value)
                  }
                  placeholder="Attribute"
                  title="Attribute name"
                />
                <Textarea
                  value={entry.value}
                  onChange={(event) =>
                    onAttributeChange?.(index, "value", event.target.value)
                  }
                  placeholder="Describe this attribute"
                  title="Attribute value"
                  className="min-h-20"
                />
              </div>
              <div className="flex flex-col items-end gap-2">
                <select
                  className="app-editor-select py-0.5"
                  value={tier ?? ""}
                  title="How often this attribute changes in the story"
                  onChange={(event) => {
                    const next = event.target.value || undefined;
                    onMutabilityChange?.(
                      index,
                      next as CharacterAppearanceEntry["mutabilityTier"],
                    );
                  }}
                >
                  <option value="">tier</option>
                  <option value="stable">stable</option>
                  <option value="semi-stable">semi-stable</option>
                  <option value="mutable">mutable</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemoveAttribute?.(index)}
                  title="Remove attribute"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAddAttribute}
        className="self-start"
      >
        <Plus className="mr-1 h-4 w-4" />
        Add Attribute
      </Button>
    </div>
  );
}

function FieldHelpText({ field }: { field: FieldDefinition }) {
  return <span className="app-editor-summary">{field.tooltip}</span>;
}

export function CharacterFormField({
  field,
  value,
  onChange,
  attributes,
  onAttributeChange,
  onAddAttribute,
  onRemoveAttribute,
  onMutabilityChange,
}: {
  field: FieldDefinition;
  value?: string;
  onChange?: (value: string) => void;
  attributes?: CharacterBuilderDraft["appearance"];
  onAttributeChange?: (
    index: number,
    key: "attribute" | "value",
    value: string,
  ) => void;
  onAddAttribute?: () => void;
  onRemoveAttribute?: (index: number) => void;
  onMutabilityChange?: (
    index: number,
    tier: CharacterAppearanceEntry["mutabilityTier"],
  ) => void;
}) {
  const resolvedValue = value ?? "";

  let control = null;
  if (field.key === "pronouns" && onChange) {
    control = (
      <PronounsField field={field} value={resolvedValue} onChange={onChange} />
    );
  } else if ((field.type === "text" || field.type === "textarea") && onChange) {
    control = (
      <TextFieldControl
        field={field}
        value={resolvedValue}
        onChange={onChange}
      />
    );
  } else if (field.type === "select" && onChange) {
    control = (
      <SelectFieldControl
        field={field}
        value={resolvedValue}
        onChange={onChange}
      />
    );
  } else if (field.type === "attribute-list" && attributes) {
    control = (
      <AttributeListField
        attributes={attributes}
        onAttributeChange={onAttributeChange}
        onAddAttribute={onAddAttribute}
        onRemoveAttribute={onRemoveAttribute}
        onMutabilityChange={onMutabilityChange}
      />
    );
  }

  return (
    <label className="flex flex-col gap-2 text-sm" title={field.tooltip}>
      <FieldLabel field={field} />
      {control}
      <FieldHelpText field={field} />
    </label>
  );
}
