"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CHARACTER_TABS,
  type CharacterBuilderTabId,
} from "@/lib/character-schema";
import {
  AppearanceTab,
  BehaviorTab,
  DemeanorTab,
  IdentityTab,
} from "@/components/story/character-builder-tabs";
import { CharacterSourceTab } from "@/components/story/character-source-tab";
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
              href={`/stories/${storyId}`}
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
          <Link href={`/stories/${storyId}`} aria-label="Back to story editor">
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
) {
  if (!builder.draft || !builder.character) return null;

  switch (tabId) {
    case "identity":
      return (
        <IdentityTab
          draft={builder.draft}
          onNameChange={builder.setName}
          onRoleChange={builder.setRole}
          onPlayerChange={builder.setIsPlayer}
          onBackgroundChange={builder.setBackground}
          onIdentityFieldChange={builder.updateIdentityField}
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
        />
      );
    case "demeanor":
      return (
        <DemeanorTab
          draft={builder.draft}
          onChange={builder.setStartingDemeanor}
        />
      );
    case "source":
      return (
        <CharacterSourceTab
          importedMarkdown={builder.character.importedMarkdown}
          provenance={builder.character.provenance}
          onParse={() => builder.parseFromImport()}
          busy={builder.saving}
        />
      );
  }

  return null;
}

function MobileTabAccordion({
  activeTab,
  onTabChange,
  builder,
}: {
  activeTab: CharacterBuilderTabId;
  onTabChange: (value: CharacterBuilderTabId) => void;
  builder: ReturnType<typeof useCharacterBuilder>;
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
            <div className="mt-4">{renderTabContent(tab.id, builder)}</div>
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
}: {
  activeTab: CharacterBuilderTabId;
  onTabChange: (value: CharacterBuilderTabId) => void;
  builder: ReturnType<typeof useCharacterBuilder>;
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
            {renderTabContent(tab.id, builder)}
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
            />
            <DesktopTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              builder={builder}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
