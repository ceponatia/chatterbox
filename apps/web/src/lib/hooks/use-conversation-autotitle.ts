"use client";

import { useEffect, type RefObject } from "react";
import type { UIMessage } from "ai";
import {
  listConversations,
  saveConversation,
  type Conversation,
  type ConversationMeta,
} from "@/lib/storage";

export function useAutoTitle(
  activeConvRef: RefObject<Conversation | null>,
  messages: UIMessage[],
  setConversations: (conversations: ConversationMeta[]) => void,
) {
  useEffect(() => {
    if (!activeConvRef.current) return;
    const conv = activeConvRef.current;
    if (conv.title !== "New Chat") return;

    const firstUser = messages.find((message) => message.role === "user");
    const textPart = firstUser?.parts?.find((part) => part.type === "text");
    if (!textPart || textPart.type !== "text") return;

    conv.title =
      textPart.text.slice(0, 60) + (textPart.text.length > 60 ? "…" : "");

    void (async () => {
      try {
        await saveConversation(conv);
        setConversations(await listConversations());
      } catch (error) {
        console.error("Failed to auto-title conversation:", error);
      }
    })();
  }, [messages, activeConvRef, setConversations]);
}
