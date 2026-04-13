"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CHARACTER_TABS,
  type CharacterBuilderTabId,
} from "@/lib/character-schema";
import { getStoryLocations } from "@/lib/story-project-client";
import type { StoryLocationRecord } from "@/lib/story-project-types";
import {
  AppearanceTab,
  BehaviorTab,
  DemeanorTab,
  IdentityTab,
} from "@/components/story/character-builder-tabs";
import { SensoryTab } from "@/components/story/sensory-editor";
import { useCharacterBuilder } from "@/components/story/use-character-builder";

function CharacterBuilderLoadingState() {
  return (
    <div className="app-shell safe-top">
      <div className="app-chat-pane">
        <main className="app-story-main">
          <div className="app-empty-state-card self-center">
            Loading character...
          </div>
        </main>
      </div>
    </div>
  );
}

function CharacterBuilderMissingState({ storyId }: { storyId: string }) {
  return (
    <div className="app-shell safe-top">
      <div className="app-chat-pane">
        <header className="app-panel-header h-14 px-3 lg:h-16 lg:px-4">
          <Button
            asChild={true}
            variant="ghost"
            size="sm"
            className="app-button-square"
          >
            <Link
              href={`/stories/${storyId}?tab=characters`}
              aria-label="Back to story editor"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </header>
        <main className="app-story-main">
          <div className="app-empty-state-card self-center">
            Character not found.
          </div>
        </main>
      </div>
    </div>
  );
}

function CharacterBuilderHeader({
  storyId,
  characterName,
  dirty,
  saving,
  onSave,
}: {
  storyId: string;
  characterName: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <header className="app-panel-header h-14 px-3 lg:h-16 lg:px-4">
      <div className="flex items-center gap-3">
        <Button
          asChild={true}
          variant="ghost"
          size="sm"
          className="app-button-square"
        >
          <Link
            href={`/stories/${storyId}?tab=characters`}
            aria-label="Back to story editor"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-base font-bold tracking-tight lg:text-lg">
            {characterName}
          </h1>
          <p className="app-editor-summary">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </p>
        </div>
      </div>
      <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
        <Save className="mr-1 h-4 w-4" />
        {saving ? "Saving..." : "Save"}
      </Button>
    </header>
  );
}

function renderTabContent(
  tabId: CharacterBuilderTabId,
  builder: ReturnType<typeof useCharacterBuilder>,
  storyId: string,
  characterId: string,
  locations: StoryLocationRecord[],
) {
  if (!builder.draft || !builder.character) return null;

  switch (tabId) {
    case "identity":
      return (
        <IdentityTab
          draft={builder.draft}
          locations={locations}
          onNameChange={builder.setName}
          onRoleChange={builder.setRole}
          onBackgroundChange={builder.setBackground}
          onIdentityFieldChange={builder.updateIdentityField}
          onDefaultLocationChange={builder.setDefaultLocationId}
        />
      );
    case "appearance":
      return (
        <AppearanceTab
          draft={builder.draft}
          onAppearanceChange={builder.updateAppearanceEntry}
          onAddAttribute={builder.addAppearanceEntry}
          onRemoveAttribute={builder.removeAppearanceEntry}
          onMutabilityChange={builder.setMutabilityTier}
        />
      );
    case "behavior":
      return (
        <BehaviorTab
          draft={builder.draft}
          onBehaviorFieldChange={builder.updateBehaviorField}
          onAddDialogueExample={builder.addDialogueExample}
          onRemoveDialogueExample={builder.removeDialogueExample}
          onUpdateDialogueExample={builder.updateDialogueExample}
        />
      );
    case "demeanor":
      return (
        <DemeanorTab
          draft={builder.draft}
          onChange={builder.setStartingDemeanor}
        />
      );
    case "sensory":
      return (
        <SensoryTab
          draft={builder.draft}
          storyId={storyId}
          characterId={characterId}
          onOverallChange={builder.updateSensoryOverall}
          onOverallLockToggle={builder.toggleSensoryOverallLock}
          onAttributeChange={builder.updateSensoryAttribute}
          onAttributeLockToggle={builder.toggleSensoryAttributeLock}
          onProfileUpdate={builder.setSensoryProfile}
          onSyncAttributes={builder.syncSensoryAttributesWithAppearance}
        />
      );
  }

  return null;
}

function MobileTabAccordion({
  activeTab,
  onTabChange,
  builder,
  storyId,
  characterId,
  locations,
}: {
  activeTab: CharacterBuilderTabId;
  onTabChange: (value: CharacterBuilderTabId) => void;
  builder: ReturnType<typeof useCharacterBuilder>;
  storyId: string;
  characterId: string;
  locations: StoryLocationRecord[];
}) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {CHARACTER_TABS.map((tab) => (
        <div key={tab.id} className="app-story-card">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => onTabChange(tab.id)}
          >
            <span className="text-sm font-semibold">{tab.label}</span>
            <span className="app-editor-summary">
              {activeTab === tab.id ? "Open" : "Tap to open"}
            </span>
          </button>
          {activeTab === tab.id && (
            <div className="mt-4">
              {renderTabContent(tab.id, builder, storyId, characterId, locations)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DesktopTabs({
  activeTab,
  onTabChange,
  builder,
  storyId,
  characterId,
  locations,
}: {
  activeTab: CharacterBuilderTabId;
  onTabChange: (value: CharacterBuilderTabId) => void;
  builder: ReturnType<typeof useCharacterBuilder>;
  storyId: string;
  characterId: string;
  locations: StoryLocationRecord[];
}) {
  return (
    <div className="hidden md:block">
      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as CharacterBuilderTabId)}
      >
        <TabsList className="app-tabs-list">
          {CHARACTER_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="app-tabs-trigger flex-1"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {CHARACTER_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {renderTabContent(tab.id, builder, storyId, characterId, locations)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export function CharacterBuilderClient({
  storyId,
  characterId,
}: {
  storyId: string;
  characterId: string;
}) {
  const builder = useCharacterBuilder({ storyId, characterId });
  const [activeTab, setActiveTab] = useState<CharacterBuilderTabId>("identity");
  const [locations, setLocations] = useState<StoryLocationRecord[]>([]);

  useEffect(() => {
    let active = true;
    void getStoryLocations(storyId).then((result) => {
      if (active) setLocations(result);
    });
    return () => {
      active = false;
    };
  }, [storyId]);

  if (builder.loading) return <CharacterBuilderLoadingState />;
  if (!builder.character || !builder.draft) {
    return <CharacterBuilderMissingState storyId={storyId} />;
  }

  return (
    <div className="app-shell safe-top">
      <div className="app-chat-pane">
        <CharacterBuilderHeader
          storyId={storyId}
          characterName={builder.draft.name || builder.character.name}
          dirty={builder.isDirty}
          saving={builder.saving}
          onSave={() => void builder.save()}
        />
        <main className="app-story-main">
          <div className="app-story-column">
            {builder.error && (
              <div className="app-editor-warning text-xs">{builder.error}</div>
            )}
            {builder.status && (
              <div className="app-editor-summary text-xs">{builder.status}</div>
            )}
            <MobileTabAccordion
              activeTab={activeTab}
              onTabChange={setActiveTab}
              builder={builder}
              storyId={storyId}
              characterId={characterId}
              locations={locations}
            />
            <DesktopTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              builder={builder}
              storyId={storyId}
              characterId={characterId}
              locations={locations}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
