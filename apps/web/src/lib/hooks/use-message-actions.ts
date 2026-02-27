"use client";

import { useState, useCallback } from "react";
import type { UIMessage } from "ai";

interface Params {
  messages: UIMessage[];
  setMessages: (messages: UIMessage[]) => void;
  sendMessage: (params: { text: string }) => void;
}

function findPrecedingUserMessage(
  messages: UIMessage[],
  targetIdx: number,
): number {
  for (let index = targetIdx; index >= 0; index--) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function extractTextFromMessage(msg: UIMessage): string {
  return (
    msg.parts
      ?.filter(
        (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
      )
      .map((p) => p.text)
      .join("") ?? ""
  );
}

export function useMessageActions({
  messages,
  setMessages,
  sendMessage,
}: Params) {
  const [input, setInput] = useState("");

  const handleEditMessage = useCallback(
    (id: string, newText: string) => {
      setMessages(
        messages.map((m) =>
          m.id === id
            ? { ...m, parts: [{ type: "text" as const, text: newText }] }
            : m,
        ),
      );
    },
    [messages, setMessages],
  );

  const handleDeleteMessage = useCallback(
    (id: string) => {
      setMessages(messages.filter((m) => m.id !== id));
    },
    [messages, setMessages],
  );

  const handleDeleteAfter = useCallback(
    (id: string): UIMessage[] => {
      const idx = messages.findIndex((m) => m.id === id);
      if (idx < 0) return [];
      const kept = messages.slice(0, idx + 1);
      const removed = messages.slice(idx + 1);
      setMessages(kept);
      return removed;
    },
    [messages, setMessages],
  );

  const handleRetryMessage = useCallback(
    (id: string) => {
      const idx = messages.findIndex((m) => m.id === id);
      if (idx < 0) return;

      const userIdx = findPrecedingUserMessage(messages, idx);
      if (userIdx < 0) return;

      const userMsg = messages[userIdx];
      if (!userMsg) return;
      const userText = extractTextFromMessage(userMsg);
      setMessages(messages.slice(0, userIdx));
      sendMessage({ text: userText });
    },
    [messages, setMessages, sendMessage],
  );

  const handleEditAndGenerate = useCallback(
    (id: string, newText: string) => {
      const idx = messages.findIndex((m) => m.id === id);
      if (idx < 0) return;
      setMessages(messages.slice(0, idx));
      sendMessage({ text: newText });
    },
    [messages, setMessages, sendMessage],
  );

  const handleSend = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput("");
      sendMessage({ text });
    },
    [input, sendMessage],
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return {
    input,
    setInput,
    handleEditMessage,
    handleDeleteMessage,
    handleDeleteAfter,
    handleRetryMessage,
    handleEditAndGenerate,
    handleSend,
    handleClearChat,
  };
}
