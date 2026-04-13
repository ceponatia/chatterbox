"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { ConnectionEditor } from "@/components/story/connection-editor";
import { LocationForm } from "@/components/story/location-form";
import {
  createStoryLocation,
  deleteStoryLocation,
  updateLocationConnections,
  updateStoryLocation,
} from "@/lib/story-project-client";
import type {
  LocationConnectionInput,
  StoryLocationInput,
  StoryLocationRecord,
} from "@/lib/story-project-types";

interface LocationEditorProps {
  storyId: string;
  locations: StoryLocationRecord[];
  refreshProject: () => Promise<unknown>;
}

function useLocationActions(
  storyId: string,
  locations: StoryLocationRecord[],
  refreshProject: () => Promise<unknown>,
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setSaving(true);
    setError(null);
    try {
      const result = await work();
      await refreshProject();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  return {
    saving,
    error,
    handleCreate: (input: StoryLocationInput) =>
      run(() =>
        createStoryLocation(storyId, { ...input, sortOrder: locations.length }),
      ),
    handleUpdate: (locationId: string, input: StoryLocationInput) =>
      run(() => updateStoryLocation(storyId, locationId, input)),
    handleDelete: (locationId: string) =>
      run(() => deleteStoryLocation(storyId, locationId)),
    handleUpdateConnections: (
      locationId: string,
      connections: LocationConnectionInput[],
    ) =>
      run(() =>
        updateLocationConnections(storyId, locationId, connections),
      ),
    handleSwapOrder: async (indexA: number, indexB: number) => {
      const locA = locations[indexA];
      const locB = locations[indexB];
      if (!locA || !locB) return;
      await run(() =>
        Promise.all([
          updateStoryLocation(storyId, locA.id, {
            name: locA.name, description: locA.description,
            tags: locA.tags, atmosphere: locA.atmosphere,
            sortOrder: locB.sortOrder,
          }),
          updateStoryLocation(storyId, locB.id, {
            name: locB.name, description: locB.description,
            tags: locB.tags, atmosphere: locB.atmosphere,
            sortOrder: locA.sortOrder,
          }),
        ]),
      );
    },
  };
}

function LocationRow({
  location,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  location: StoryLocationRecord;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="app-editor-card flex items-start justify-between gap-2 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium">{location.name}</span>
        </div>
        {location.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {location.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {location.atmosphere && (
          <p className="truncate text-[11px] text-muted-foreground">
            {location.atmosphere}
          </p>
        )}
        {location.connections.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {location.connections.length} connection
            {location.connections.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          disabled={isFirst} onClick={onMoveUp} title="Move up"
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          disabled={isLast} onClick={onMoveDown} title="Move down"
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          onClick={onEdit} title="Edit location"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <ConfirmDeleteButton onConfirm={onDelete} />
      </div>
    </div>
  );
}

export function LocationEditor({
  storyId,
  locations,
  refreshProject,
}: LocationEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const actions = useLocationActions(storyId, locations, refreshProject);

  const sorted = [...locations].sort((a, b) => a.sortOrder - b.sortOrder);
  const editingLocation = editingId
    ? sorted.find((l) => l.id === editingId)
    : undefined;

  return (
    <div className="app-story-card app-story-stack">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Locations</h2>
        <Button
          type="button" variant="ghost" size="sm"
          className="h-7 gap-1 text-xs"
          disabled={actions.saving || isAdding || editingId !== null}
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-3 w-3" />
          Add Location
        </Button>
      </div>

      {actions.error && (
        <div className="app-editor-warning text-xs">{actions.error}</div>
      )}

      {sorted.length === 0 && !isAdding && (
        <p className="text-xs text-muted-foreground">
          No locations defined yet.
        </p>
      )}

      {isAdding && (
        <div className="app-editor-card border-dashed p-3">
          <LocationForm
            onSubmit={async (input) => {
              await actions.handleCreate(input);
              setIsAdding(false);
            }}
            onCancel={() => setIsAdding(false)}
            saving={actions.saving}
          />
        </div>
      )}

      {sorted.map((location, index) =>
        editingId === location.id && editingLocation ? (
          <div key={location.id} className="app-editor-card p-3">
            <LocationForm
              location={editingLocation}
              onSubmit={async (input) => {
                await actions.handleUpdate(location.id, input);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              saving={actions.saving}
            />
            <div className="mt-3 border-t border-border pt-3">
              <ConnectionEditor
                locationId={location.id}
                connections={location.connections}
                allLocations={sorted}
                onSave={async (conns) => {
                  await actions.handleUpdateConnections(location.id, conns);
                }}
                saving={actions.saving}
              />
            </div>
          </div>
        ) : (
          <LocationRow
            key={location.id}
            location={location}
            onEdit={() => setEditingId(location.id)}
            onDelete={() => void actions.handleDelete(location.id)}
            onMoveUp={() => void actions.handleSwapOrder(index, index - 1)}
            onMoveDown={() => void actions.handleSwapOrder(index, index + 1)}
            isFirst={index === 0}
            isLast={index === sorted.length - 1}
          />
        ),
      )}
    </div>
  );
}
