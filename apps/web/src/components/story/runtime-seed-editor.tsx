"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RuntimeSeed } from "@/lib/story-project-types";

const EMPTY_SEED: RuntimeSeed = {
  openingScene: "",
  openThreads: [],
  hardFacts: [],
  customState: "",
};

interface RuntimeSeedEditorProps {
  seed: RuntimeSeed | null;
  onChange: (seed: RuntimeSeed) => void;
}

function DynamicStringList({
  label,
  description,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  description: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  function handleAdd() {
    onChange([...items, ""]);
  }

  function handleUpdate(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      <p className="text-[10px] text-muted-foreground">{description}</p>
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              value={item}
              onChange={(event) => handleUpdate(index, event.target.value)}
              placeholder={placeholder}
              className="flex-1 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              onClick={() => handleRemove(index)}
              title="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit gap-1 text-xs"
        onClick={handleAdd}
      >
        <Plus className="h-3 w-3" />
        Add
      </Button>
    </div>
  );
}

export function RuntimeSeedEditor({ seed, onChange }: RuntimeSeedEditorProps) {
  const current = seed ?? EMPTY_SEED;

  function update(patch: Partial<RuntimeSeed>) {
    onChange({ ...current, ...patch });
  }

  return (
    <div className="app-story-card app-story-stack">
      <h2 className="text-sm font-semibold">Runtime Seed</h2>
      <p className="text-[10px] text-muted-foreground">
        Optional. Seeds the opening story state when launching a conversation.
        Leave empty to start with a blank state.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Opening Scene</label>
          <p className="text-[10px] text-muted-foreground">
            Describe the initial scene when the story begins.
          </p>
          <Textarea
            value={current.openingScene}
            onChange={(event) => update({ openingScene: event.target.value })}
            placeholder="The story opens in..."
            className="min-h-20 font-mono text-xs leading-relaxed"
          />
        </div>

        <DynamicStringList
          label="Open Threads"
          description="Initial story threads to seed at the start."
          items={current.openThreads}
          placeholder="Story thread description"
          onChange={(openThreads) => update({ openThreads })}
        />

        <DynamicStringList
          label="Hard Facts"
          description="Established facts about the world or characters."
          items={current.hardFacts}
          placeholder="Fact statement"
          onChange={(hardFacts) => update({ hardFacts })}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Custom State</label>
          <p className="text-[10px] text-muted-foreground">
            Additional freeform state markdown.
          </p>
          <Textarea
            value={current.customState}
            onChange={(event) => update({ customState: event.target.value })}
            placeholder="Any additional state..."
            className="min-h-20 font-mono text-xs leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
