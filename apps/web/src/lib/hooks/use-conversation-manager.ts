"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  listConversations,
  loadConversation,
  saveConversation,
  createConversationDraft,
  deleteConversation,
  type Conversation,
  type ConversationMeta,
} from "@/lib/storage";
import type { SerializedSegment } from "@chatterbox/prompt-assembly";
import type { Settings } from "@/lib/defaults";
import { useFieldSetters } from "./use-field-setters";
import { useSyncStatus } from "./use-sync-status";

interface Params {
  messages: UIMessage[];
  setMessages: (messages: UIMessage[]) => void;
  onConfigSync: (config: {
    systemPrompt: string;
    storyState: string;
    settings: Settings;
    customSegments?: SerializedSegment[] | null;
  }) => void;
  onConversationSwitch?: () => void;
}

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

  const fields = useFieldSetters();
  const syncStatus = useSyncStatus();

  // Keep refs so callbacks always reach the latest sync function / field values
  const syncRef = useRef(onConfigSync);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    syncRef.current = onConfigSync;
  }, [onConfigSync]);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const hydrateConversation = useCallback(
    (conv: Conversation, persisted: boolean) => {
      activeConvRef.current = conv;
      activeConvPersistedRef.current = persisted;
      setActiveConvId(conv.id);
      setMessages(conv.messages);
      const f = fieldsRef.current;
      f.resetInputTouchFlags();
      f.setSystemPrompt(conv.systemPrompt);
      f.setStoryState(conv.storyState);
      f.setPreviousStoryState(conv.previousStoryState);
      f.setStoryStateLastUpdated(conv.storyStateLastUpdated);
      f.setSettings(conv.settings);
      f.setSystemPromptBaseline(conv.systemPromptBaseline);
      f.setStoryStateBaseline(conv.storyStateBaseline);
      f.setLastIncludedAt(conv.lastIncludedAt ?? {});
      f.setCustomSegments(conv.customSegments ?? null);
      f.setStructuredState(conv.structuredState ?? null);
      f.setLastSummarizedTurn(conv.lastSummarizedTurn ?? 0);
      f.setLastPipelineTurn(conv.lastPipelineTurn ?? 0);
      syncRef.current({
        systemPrompt: conv.systemPrompt,
        storyState: conv.storyState,
        settings: conv.settings,
        customSegments: conv.customSegments,
      });
    },
    [setMessages],
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

  useEffect(() => {
    onConfigSync({
      systemPrompt: fields.systemPrompt,
      storyState: fields.storyState,
      settings: fields.settings,
      customSegments: fields.customSegments,
    });
  }, [
    fields.systemPrompt,
    fields.storyState,
    fields.settings,
    fields.customSegments,
    onConfigSync,
  ]);

  // Wrap import handlers to immediately sync liveConfig (not just via deferred useEffect)
  const handleSystemPromptImport = useCallback((content: string) => {
    fieldsRef.current.handleSystemPromptImport(content);
    const f = fieldsRef.current;
    // Sync the parsed/assembled markdown, not the raw import
    syncRef.current({
      systemPrompt: f.systemPrompt,
      storyState: f.storyState,
      settings: f.settings,
      customSegments: f.customSegments,
    });
  }, []);

  const handleStoryStateImport = useCallback((content: string) => {
    fieldsRef.current.handleStoryStateImport(content);
    const f = fieldsRef.current;
    syncRef.current({
      systemPrompt: f.systemPrompt,
      storyState: content,
      settings: f.settings,
    });
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeConvId) {
        setConvDrawerOpen(false);
        return;
      }
      void (async () => {
        const conv = await loadConversation(id);
        if (!conv) return;
        onConversationSwitch?.();
        hydrateConversation(conv, true);
        setConvDrawerOpen(false);
      })();
    },
    [activeConvId, hydrateConversation, onConversationSwitch],
  );

  const handleNewConversation = useCallback(() => {
    onConversationSwitch?.();
    const conv = createConversationDraft();
    hydrateConversation(conv, false);
    setConvDrawerOpen(false);
  }, [hydrateConversation, onConversationSwitch]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      void (async () => {
        await deleteConversation(id);
        const remaining = await listConversations();
        setConversations(remaining);
        if (id !== activeConvId) return;
        const fallback = createConversationDraft();
        hydrateConversation(fallback, false);
      })();
    },
    [activeConvId, hydrateConversation],
  );

  return {
    conversations,
    activeConvId,
    convDrawerOpen,
    setConvDrawerOpen,
    ...fields,
    ...syncStatus,
    handleSystemPromptImport,
    handleStoryStateImport,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
  };
}

// ---------------------------------------------------------------------------
// Side-effect hooks extracted to keep useConversationManager under 100 lines
// ---------------------------------------------------------------------------

function useHydrateOnMount(
  hydrateConversation: (conv: Conversation, persisted: boolean) => void,
  setConversations: (c: ConversationMeta[]) => void,
) {
  useEffect(() => {
    let active = true;
    const init = async () => {
      // Landing guard: always boot into a fresh empty conversation.
      // Do not auto-load any existing conversation on startup.
      const index = await listConversations();
      if (!active) return;
      setConversations(index);
      const conv = createConversationDraft();
      if (!active) return;
      hydrateConversation(conv, false);
    };
    void init();
    return () => {
      active = false;
    };
  }, [hydrateConversation, setConversations]);
}

function useAutoSave(
  activeConvRef: React.RefObject<Conversation | null>,
  activeConvPersistedRef: React.RefObject<boolean>,
  activeConvId: string | null,
  messages: UIMessage[],
  fields: ReturnType<typeof useFieldSetters>,
  setConversations: (c: ConversationMeta[]) => void,
  onSaved: () => void,
  onStoryPending: () => void,
  onPromptPending: () => void,
) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    systemPrompt,
    storyState,
    previousStoryState,
    storyStateLastUpdated,
    settings,
    systemPromptBaseline,
    storyStateBaseline,
    lastIncludedAt,
    customSegments,
    structuredState,
    lastSummarizedTurn,
    lastPipelineTurn,
    storyStateTouched,
    systemPromptTouched,
  } = fields;

  // Track previous values to detect which field actually changed
  const prevStoryRef = useRef(storyState);
  const prevPromptRef = useRef(systemPrompt);

  // Track conversation switches — skip save when ID just changed because
  // React state still holds stale values from the previous conversation.
  // The new conversation was already persisted by createConversation().
  const prevConvIdRef = useRef(activeConvId);

  useEffect(() => {
    if (!activeConvRef.current || !activeConvId) return;

    // Conversation just switched — skip this save cycle.
    // React state setters are batched, so field values are still stale.
    if (prevConvIdRef.current !== activeConvId) {
      prevConvIdRef.current = activeConvId;
      prevStoryRef.current = storyState;
      prevPromptRef.current = systemPrompt;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      return;
    }

    const hasUserMessage = messages.some((m) => m.role === "user");
    const shouldPersistDraft =
      storyStateTouched || systemPromptTouched || hasUserMessage;

    if (!activeConvPersistedRef.current && !shouldPersistDraft) {
      return;
    }

    // Mark the specific field(s) that changed as pending
    if (storyState !== prevStoryRef.current) onStoryPending();
    if (systemPrompt !== prevPromptRef.current) onPromptPending();
    prevStoryRef.current = storyState;
    prevPromptRef.current = systemPrompt;

    const saveDelayMs = activeConvPersistedRef.current ? 500 : 0;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        const conv = activeConvRef.current;
        if (!conv) return;
        Object.assign(conv, {
          messages,
          systemPrompt,
          storyState,
          previousStoryState,
          storyStateLastUpdated,
          settings,
          systemPromptBaseline,
          storyStateBaseline,
          lastIncludedAt,
          customSegments,
          structuredState,
          lastSummarizedTurn,
          lastPipelineTurn,
        });
        await saveConversation(conv);
        activeConvPersistedRef.current = true;
        setConversations(await listConversations());
        onSaved();
      })();
    }, saveDelayMs);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    messages,
    systemPrompt,
    storyState,
    previousStoryState,
    storyStateLastUpdated,
    settings,
    systemPromptBaseline,
    storyStateBaseline,
    lastIncludedAt,
    customSegments,
    structuredState,
    lastSummarizedTurn,
    lastPipelineTurn,
    activeConvId,
    activeConvRef,
    activeConvPersistedRef,
    setConversations,
    onSaved,
    onStoryPending,
    onPromptPending,
    storyStateTouched,
    systemPromptTouched,
  ]);
}

function useAutoTitle(
  activeConvRef: React.RefObject<Conversation | null>,
  messages: UIMessage[],
  setConversations: (c: ConversationMeta[]) => void,
) {
  useEffect(() => {
    if (!activeConvRef.current) return;
    const conv = activeConvRef.current;
    if (conv.title !== "New Chat") return;
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) return;
    const text = firstUser.parts?.find((p) => p.type === "text");
    if (!text || text.type !== "text") return;
    const title = text.text.slice(0, 60) + (text.text.length > 60 ? "…" : "");
    conv.title = title;
    void (async () => {
      await saveConversation(conv);
      setConversations(await listConversations());
    })();
  }, [messages, activeConvRef, setConversations]);
}
