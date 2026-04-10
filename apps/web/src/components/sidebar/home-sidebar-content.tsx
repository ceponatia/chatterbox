"use client";

import { memo } from "react";
import { useChat } from "@ai-sdk/react";
import { Settings as SettingsIcon, BookOpen, ScrollText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { StoryStateEditor } from "@/components/sidebar/story-state-editor";
import { RefreshStatusIndicator } from "@/components/sidebar/refresh-status";
import type { RefreshStatus } from "@/lib/hooks/use-state-refresh";
import { SystemPromptEditor } from "@/components/sidebar/system-prompt-editor";
import { SettingsPanel } from "@/components/sidebar/settings-panel";
import { SyncDot } from "@/components/sidebar/sync-dot";
import type { StateHistoryEntry } from "@/lib/state-history";
import { getModelEntry } from "@/lib/model-registry";
import { useConversationManager } from "@/lib/hooks/use-conversation-manager";

export const HomeSidebarContent = memo(function HomeSidebarContent({
  activeTab,
  setActiveTab,
  conv,
  recentlyUpdated,
  stateHistory,
  messages,
  refreshStatus,
  lastRefreshAt,
  onManualRefresh,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  conv: ReturnType<typeof useConversationManager>;
  recentlyUpdated: boolean;
  stateHistory: StateHistoryEntry[];
  messages: ReturnType<typeof useChat>["messages"];
  refreshStatus: RefreshStatus;
  lastRefreshAt: Date | null;
  onManualRefresh: () => void;
}) {
  const modelLabel =
    getModelEntry(conv.settings.model)?.label ?? conv.settings.model;
  const turnNumber = messages.filter(
    (message) => message.role === "user",
  ).length;

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="app-tabs-list">
          <TabsTrigger
            value="story-state"
            className="app-tabs-trigger relative flex-1"
          >
            <ScrollText className="mr-1 h-3 w-3" />
            Story State
            <SyncDot
              status={recentlyUpdated ? "saved" : conv.storyStateSync}
              pulse={recentlyUpdated}
            />
          </TabsTrigger>
          <TabsTrigger
            value="system-prompt"
            className="app-tabs-trigger relative flex-1"
          >
            <BookOpen className="mr-1 h-3 w-3" />
            System Prompt
            <SyncDot status={conv.systemPromptSync} />
          </TabsTrigger>
          <TabsTrigger value="settings" className="app-tabs-trigger flex-1">
            <SettingsIcon className="mr-1 h-3 w-3" />
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="story-state" className="mt-4">
          <RefreshStatusIndicator
            status={refreshStatus}
            lastRefreshAt={lastRefreshAt}
            onManualRefresh={onManualRefresh}
          />
          <StoryStateEditor
            value={conv.storyState}
            onChange={conv.handleStoryStateChange}
            onImport={conv.handleStoryStateImport}
            onReset={conv.handleStoryStateReset}
            baseline={conv.storyStateBaseline}
            lastUpdated={conv.storyStateLastUpdated}
            recentlyUpdated={recentlyUpdated}
            stateHistory={stateHistory}
            structuredState={conv.structuredState}
            onStructuredStateUpdate={(state) =>
              conv.handleStructuredStateUpdate(state, conv.markStoryStateError)
            }
          />
        </TabsContent>
        <TabsContent value="system-prompt" className="mt-4">
          <SystemPromptEditor
            value={conv.systemPrompt}
            onChange={conv.handleSystemPromptChange}
            onImport={conv.handleSystemPromptImport}
            onReset={conv.handleSystemPromptReset}
            baseline={conv.systemPromptBaseline}
            segments={conv.customSegments}
            onSegmentUpdate={conv.handleSegmentUpdate}
            entities={conv.structuredState?.entities ?? []}
            onCharacterFileImport={conv.handleCharacterFileImport}
            lastIncludedAt={conv.lastIncludedAt}
            turnNumber={turnNumber}
          />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsPanel
            settings={conv.settings}
            onChange={conv.handleSettingsChange}
          />
        </TabsContent>
      </Tabs>
      <Separator className="my-4" />
      <p className="text-xs text-muted-foreground">
        Model: <code className="app-code-chip">{modelLabel}</code>
      </p>
    </>
  );
});
