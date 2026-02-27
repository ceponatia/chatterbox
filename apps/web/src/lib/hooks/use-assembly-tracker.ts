"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { createDefaultAssembler, createAssemblerFromSerialized } from "@chatterbox/prompt-assembly";
import type { AssemblyContext, SerializedSegment } from "@chatterbox/prompt-assembly";

const defaultAssembler = createDefaultAssembler();

/**
 * Runs the assembler client-side after each user message to update the
 * lastIncludedAt turn tracker. The route uses the same assembler + context
 * so the tracker stays in sync.
 */
export function useAssemblyTracker({
  messages,
  storyState,
  lastIncludedAt,
  setLastIncludedAt,
  customSegments,
}: {
  messages: UIMessage[];
  storyState: string;
  lastIncludedAt: Record<string, number>;
  setLastIncludedAt: (v: Record<string, number>) => void;
  customSegments?: SerializedSegment[] | null;
}) {
  const prevTurnRef = useRef(0);

  useEffect(() => {
    const turnNumber = messages.filter(m => m.role === "user").length;
    if (turnNumber <= prevTurnRef.current || turnNumber === 0) return;
    prevTurnRef.current = turnNumber;

    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    const userText = lastUserMsg?.parts?.find(p => p.type === "text");
    const currentUserMessage = userText && userText.type === "text" ? userText.text : "";

    const ctx: AssemblyContext = {
      turnNumber,
      lastIncludedAt,
      currentUserMessage,
      stateFields: parseStateFields(storyState),
      tokenBudget: 2500,
    };

    const assembler = customSegments ? createAssemblerFromSerialized(customSegments) : defaultAssembler;
    const result = assembler.assemble(ctx);

    const updated = { ...lastIncludedAt };
    for (const id of result.included) {
      updated[id] = turnNumber;
    }
    setLastIncludedAt(updated);
  }, [messages, storyState, lastIncludedAt, setLastIncludedAt, customSegments]);
}

/** Parse story state markdown into field map for on_state_field policies. */
function parseStateFields(storyState: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const sections = storyState.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx === -1) continue;
    const key = section.slice(0, newlineIdx).trim().toLowerCase().replace(/\s+/g, "_");
    const value = section.slice(newlineIdx + 1).trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}
