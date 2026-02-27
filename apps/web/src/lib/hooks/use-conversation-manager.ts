"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  listConversations, loadConversation, saveConversation, createConversation,
  deleteConversation, getActiveConversationId, setActiveConversationId,
  type Conversation, type ConversationMeta,
} from "@/lib/storage";
import type { Settings } from "@/lib/defaults";
import { useFieldSetters } from "./use-field-setters";

interface Params {
  messages: UIMessage[];
  setMessages: (messages: UIMessage[]) => void;
  onConfigSync: (config: { systemPrompt: string; storyState: string; settings: Settings }) => void;
  onConversationSwitch?: () => void;
}

export function useConversationManager({ messages, setMessages, onConfigSync, onConversationSwitch }: Params) {

  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [convDrawerOpen, setConvDrawerOpen] = useState(false);
  const activeConvRef = useRef<Conversation | null>(null);

  const fields = useFieldSetters();

  // Keep refs so callbacks always reach the latest sync function / field values
  const syncRef = useRef(onConfigSync);
  const fieldsRef = useRef(fields);
  useEffect(() => { syncRef.current = onConfigSync; }, [onConfigSync]);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);

  const hydrateConversation = useCallback(
    (conv: Conversation) => {
      activeConvRef.current = conv;
      setActiveConvId(conv.id);
      setActiveConversationId(conv.id);
      setMessages(conv.messages);
      fields.setSystemPrompt(conv.systemPrompt);
      fields.setStoryState(conv.storyState);
      fields.setPreviousStoryState(conv.previousStoryState);
      fields.setStoryStateLastUpdated(conv.storyStateLastUpdated);
      fields.setSettings(conv.settings);
      fields.setSystemPromptBaseline(conv.systemPromptBaseline);
      fields.setStoryStateBaseline(conv.storyStateBaseline);
      fields.setLastIncludedAt(conv.lastIncludedAt ?? {});
      onConfigSync({ systemPrompt: conv.systemPrompt, storyState: conv.storyState, settings: conv.settings });
    },
    [setMessages, fields, onConfigSync]
  );

  useHydrateOnMount(hydrateConversation, setConversations);
  useAutoSave(activeConvRef, activeConvId, messages, fields, setConversations);
  useAutoTitle(activeConvRef, messages, setConversations);

  useEffect(() => {
    onConfigSync({ systemPrompt: fields.systemPrompt, storyState: fields.storyState, settings: fields.settings });
  }, [fields.systemPrompt, fields.storyState, fields.settings, onConfigSync]);

  // Wrap import handlers to immediately sync liveConfig (not just via deferred useEffect)
  const handleSystemPromptImport = useCallback((content: string) => {
    fieldsRef.current.handleSystemPromptImport(content);
    const f = fieldsRef.current;
    syncRef.current({ systemPrompt: content, storyState: f.storyState, settings: f.settings });
  }, []);

  const handleStoryStateImport = useCallback((content: string) => {
    fieldsRef.current.handleStoryStateImport(content);
    const f = fieldsRef.current;
    syncRef.current({ systemPrompt: f.systemPrompt, storyState: content, settings: f.settings });
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeConvId) { setConvDrawerOpen(false); return; }
      const conv = loadConversation(id);
      if (!conv) return;
      onConversationSwitch?.();
      hydrateConversation(conv);
      setConvDrawerOpen(false);
    },
    [activeConvId, hydrateConversation, onConversationSwitch]
  );

  const handleNewConversation = useCallback(() => {
    onConversationSwitch?.();
    hydrateConversation(createConversation());
    setConversations(listConversations());
    setConvDrawerOpen(false);
  }, [hydrateConversation, onConversationSwitch]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id);
      const remaining = listConversations();
      setConversations(remaining);
      if (id !== activeConvId) return;
      const first = remaining[0];
      const next = first ? loadConversation(first.id) : null;
      hydrateConversation(next ?? createConversation());
      if (!next) setConversations(listConversations());
    },
    [activeConvId, hydrateConversation]
  );

  return {
    conversations, activeConvId, convDrawerOpen, setConvDrawerOpen,
    ...fields,
    handleSystemPromptImport, handleStoryStateImport,
    handleSelectConversation, handleNewConversation, handleDeleteConversation,
  };
}

// ---------------------------------------------------------------------------
// Side-effect hooks extracted to keep useConversationManager under 100 lines
// ---------------------------------------------------------------------------

function useHydrateOnMount(
  hydrateConversation: (conv: Conversation) => void,
  setConversations: (c: ConversationMeta[]) => void,
) {
  useEffect(() => {
    const index = listConversations();
    setConversations(index);
    const savedId = getActiveConversationId();
    let conv: Conversation | null = null;
    if (savedId) conv = loadConversation(savedId);
    const firstIdx = index[0];
    if (!conv && firstIdx) conv = loadConversation(firstIdx.id);
    if (!conv) conv = createConversation();
    hydrateConversation(conv);
    setConversations(listConversations());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function useAutoSave(
  activeConvRef: React.RefObject<Conversation | null>,
  activeConvId: string | null,
  messages: UIMessage[],
  fields: ReturnType<typeof useFieldSetters>,
  setConversations: (c: ConversationMeta[]) => void,
) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { systemPrompt, storyState, previousStoryState, storyStateLastUpdated, settings, systemPromptBaseline, storyStateBaseline, lastIncludedAt } = fields;

  useEffect(() => {
    if (!activeConvRef.current || !activeConvId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const conv = activeConvRef.current;
      if (!conv) return;
      Object.assign(conv, { messages, systemPrompt, storyState, previousStoryState, storyStateLastUpdated, settings, systemPromptBaseline, storyStateBaseline, lastIncludedAt });
      saveConversation(conv);
      setConversations(listConversations());
    }, 500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [messages, systemPrompt, storyState, previousStoryState, storyStateLastUpdated, settings, systemPromptBaseline, storyStateBaseline, lastIncludedAt, activeConvId, activeConvRef, setConversations]);
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
    saveConversation(conv);
    setConversations(listConversations());
  }, [messages, activeConvRef, setConversations]);
}
