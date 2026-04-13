"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  StoryLocationInput,
  StoryLocationRecord,
} from "@/lib/story-project-types";

function TagInput({
  tags,
  onTagsChange,
}: {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}) {
  const [tagInput, setTagInput] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onTagsChange([...tags, tag]);
    }
    setTagInput("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 text-xs">
          {tag}
          <button
            type="button"
            onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
            className="ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <Input
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(tagInput);
          }
        }}
        onBlur={() => tagInput.trim() && addTag(tagInput)}
        placeholder="Add tag..."
        className="h-7 w-28 text-xs"
      />
    </div>
  );
}

interface LocationFormProps {
  location?: StoryLocationRecord;
  onSubmit: (input: StoryLocationInput) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

export function LocationForm({
  location,
  onSubmit,
  onCancel,
  saving,
}: LocationFormProps) {
  const [name, setName] = useState(location?.name ?? "");
  const [description, setDescription] = useState(location?.description ?? "");
  const [tags, setTags] = useState<string[]>(location?.tags ?? []);
  const [atmosphere, setAtmosphere] = useState(location?.atmosphere ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit({ name: name.trim(), description, tags, atmosphere });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Location name" required className="text-xs" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Description</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe this location" rows={4} className="text-xs" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Tags</label>
        <TagInput tags={tags} onTagsChange={setTags} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Atmosphere</label>
        <Input value={atmosphere} onChange={(e) => setAtmosphere(e.target.value)}
          placeholder="Mood, lighting, sounds..." className="text-xs" />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? "Saving..." : location ? "Update" : "Create"}
        </Button>
        <Button type="button" variant="ghost" size="sm"
          onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
