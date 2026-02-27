"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { type Conversation, type ConversationMeta } from "@/lib/storage";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import type { Settings } from "@/lib/defaults";
import { useFieldSetters } from "./use-field-setters";
import { useSyncStatus } from "./use-sync-status";
import {
  hydrateFields,
  persistActiveConvId,
  useHydrateOnMount,
  useAutoSave,
  useAutoTitle,
  useConversationActions,
} from "./use-conversation-manager-helpers";

interface Params {
  messages: UIMessage[];
  setMessages: (messages: UIMessage[]) => void;
  onConfigSync: (config: {
    conversationId?: string | null;
    systemPrompt: string;
    storyState: string;
    settings: Settings;
    customSegments?: SerializedSegment[] | null;
    presentEntityIds?: string[];
  }) => void;
  onConversationSwitch?: () => void;
}

// lizard forgives nloc
export function useConversationManager({
  messages,
  setMessages,
  onConfigSync,
  onConversationSwitch,
}: Params) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [convDrawerOpen, setConvDrawerOpen] = useState(false);
  const activeConvRef = useRef<Conversation | null>(null);
  const activeConvPersistedRef = useRef(false);

  const fields = useFieldSetters(),
    syncStatus = useSyncStatus();
  const { syncRef, fieldsRef } = useLatestConfigRefs(onConfigSync, fields);

  const hydrateConversation = useCallback(
    (conv: Conversation, persisted: boolean) => {
      activeConvRef.current = conv;
      activeConvPersistedRef.current = persisted;
      setActiveConvId(conv.id);
      persistActiveConvId(conv.id);
      setMessages(conv.messages);
      hydrateFields(fieldsRef.current, conv);
      syncRef.current({
        conversationId: conv.id,
        systemPrompt: conv.systemPrompt,
        storyState: conv.storyState,
        settings: conv.settings,
        customSegments: conv.customSegments,
        presentEntityIds: conv.structuredState?.scene.presentEntityIds ?? [],
      });
    },
    [setMessages, fieldsRef, syncRef],
  );

  useHydrateOnMount(hydrateConversation, setConversations);
  useAutoSave(
    activeConvRef,
    activeConvPersistedRef,
    activeConvId,
    messages,
    fields,
    setConversations,
    syncStatus.markAllSaved,
    syncStatus.markStoryStatePending,
    syncStatus.markSystemPromptPending,
  );
  useAutoTitle(activeConvRef, messages, setConversations);
  useConfigSyncEffect(fields, activeConvId, onConfigSync);

  const actions = useConversationActions(
    activeConvId,
    hydrateConversation,
    fieldsRef,
    syncRef,
    setConvDrawerOpen,
    setConversations,
    onConversationSwitch,
  );

  return {
    conversations,
    activeConvId,
    convDrawerOpen,
    setConvDrawerOpen,
    ...fields,
    ...syncStatus,
    ...actions,
  };
}

function useLatestConfigRefs(
  onConfigSync: Params["onConfigSync"],
  fields: ReturnType<typeof useFieldSetters>,
) {
  const syncRef = useRef(onConfigSync);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    syncRef.current = onConfigSync;
  }, [onConfigSync]);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  return { syncRef, fieldsRef };
}

function useConfigSyncEffect(
  fields: ReturnType<typeof useFieldSetters>,
  activeConvId: string | null,
  onConfigSync: Params["onConfigSync"],
) {
  useEffect(() => {
    onConfigSync({
      conversationId: activeConvId,
      systemPrompt: fields.systemPrompt,
      storyState: fields.storyState,
      settings: fields.settings,
      customSegments: fields.customSegments,
      presentEntityIds: fields.structuredState?.scene.presentEntityIds ?? [],
    });
  }, [
    fields.systemPrompt,
    fields.storyState,
    fields.settings,
    fields.customSegments,
    fields.structuredState,
    activeConvId,
    onConfigSync,
  ]);
}
