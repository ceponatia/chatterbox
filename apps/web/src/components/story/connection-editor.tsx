"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  LocationConnectionInput,
  LocationConnectionRecord,
  StoryLocationRecord,
} from "@/lib/story-project-types";

interface DraftConnection {
  toLocationId: string;
  description: string;
  traversalHint: string;
  bidirectional: boolean;
}

interface ConnectionEditorProps {
  locationId: string;
  connections: LocationConnectionRecord[];
  allLocations: StoryLocationRecord[];
  onSave: (connections: LocationConnectionInput[]) => Promise<void>;
  saving?: boolean;
}

function toDrafts(connections: LocationConnectionRecord[]): DraftConnection[] {
  return connections.map((c) => ({
    toLocationId: c.toLocationId,
    description: c.description ?? "",
    traversalHint: c.traversalHint ?? "",
    bidirectional: c.bidirectional,
  }));
}

function draftsToInputs(drafts: DraftConnection[]): LocationConnectionInput[] {
  return drafts
    .filter((d) => d.toLocationId)
    .map((d) => ({
      toLocationId: d.toLocationId,
      description: d.description || null,
      traversalHint: d.traversalHint || null,
      bidirectional: d.bidirectional,
    }));
}

function ConnectionRow({
  draft,
  index,
  availableLocations,
  onUpdate,
  onRemove,
}: {
  draft: DraftConnection;
  index: number;
  availableLocations: StoryLocationRecord[];
  onUpdate: (index: number, patch: Partial<DraftConnection>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="app-editor-card flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <Select
          value={draft.toLocationId || "none"}
          onValueChange={(v) =>
            onUpdate(index, { toLocationId: v === "none" ? "" : v })
          }
        >
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Destination" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select destination</SelectItem>
            {availableLocations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          onClick={() => onRemove(index)}
          title="Remove connection"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={draft.description}
          onChange={(e) => onUpdate(index, { description: e.target.value })}
          placeholder="Description"
          className="text-xs"
        />
        <Input
          value={draft.traversalHint}
          onChange={(e) => onUpdate(index, { traversalHint: e.target.value })}
          placeholder="Traversal hint"
          className="text-xs"
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.bidirectional}
          onChange={(e) => onUpdate(index, { bidirectional: e.target.checked })}
          className="rounded"
        />
        Bidirectional
      </label>
    </div>
  );
}

export function ConnectionEditor({
  locationId,
  connections,
  allLocations,
  onSave,
  saving,
}: ConnectionEditorProps) {
  const connectionsKey = useMemo(
    () => JSON.stringify(connections.map((c) => c.id)),
    [connections],
  );
  const [drafts, setDrafts] = useState<DraftConnection[]>(() =>
    toDrafts(connections),
  );
  const [dirty, setDirty] = useState(false);
  const [prevKey, setPrevKey] = useState(connectionsKey);

  if (connectionsKey !== prevKey) {
    setDrafts(toDrafts(connections));
    setDirty(false);
    setPrevKey(connectionsKey);
  }

  const usedIds = new Set(drafts.map((d) => d.toLocationId));
  const availableLocations = allLocations.filter(
    (loc) => loc.id !== locationId && !usedIds.has(loc.id),
  );

  function handleUpdate(index: number, patch: Partial<DraftConnection>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
    setDirty(true);
  }

  function handleRemove(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function handleAdd() {
    setDrafts((prev) => [
      ...prev,
      { toLocationId: "", description: "", traversalHint: "", bidirectional: true },
    ]);
    setDirty(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Connections</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleAdd}
          disabled={availableLocations.length === 0 && drafts.every((d) => d.toLocationId)}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      {drafts.length === 0 && (
        <p className="text-xs text-muted-foreground">No connections.</p>
      )}
      {drafts.map((draft, index) => (
        <ConnectionRow
          key={index}
          draft={draft}
          index={index}
          availableLocations={
            draft.toLocationId
              ? [...availableLocations, ...allLocations.filter((l) => l.id === draft.toLocationId)]
              : availableLocations
          }
          onUpdate={handleUpdate}
          onRemove={handleRemove}
        />
      ))}
      {dirty && (
        <Button
          type="button"
          size="sm"
          className="w-fit"
          disabled={saving}
          onClick={() => void onSave(draftsToInputs(drafts))}
        >
          {saving ? "Saving..." : "Save connections"}
        </Button>
      )}
    </div>
  );
}
