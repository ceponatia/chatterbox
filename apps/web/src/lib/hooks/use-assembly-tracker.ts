"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  createDefaultAssembler,
  createAssemblerFromSerialized,
} from "@chatterbox/prompt-assembly";
import type {
  AssemblyContext,
  SerializedSegment,
} from "@chatterbox/prompt-assembly";
import { parseStateFields } from "@/lib/state-utils";

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
  const lastIncludedAtRef = useRef(lastIncludedAt);
  lastIncludedAtRef.current = lastIncludedAt;

  useEffect(() => {
    const turnNumber = messages.filter((m) => m.role === "user").length;
    if (turnNumber <= prevTurnRef.current || turnNumber === 0) return;
    prevTurnRef.current = turnNumber;

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUserMsg?.parts?.find((p) => p.type === "text");
    const currentUserMessage =
      userText && userText.type === "text" ? userText.text : "";

    const ctx: AssemblyContext = {
      turnNumber,
      lastIncludedAt: lastIncludedAtRef.current,
      currentUserMessage,
      stateFields: parseStateFields(storyState),
      tokenBudget: 2500,
    };

    const assembler = customSegments
      ? createAssemblerFromSerialized(customSegments)
      : defaultAssembler;
    const result = assembler.assemble(ctx);

    const updated = { ...lastIncludedAtRef.current };
    for (const id of result.included) {
      updated[id] = turnNumber;
    }
    setLastIncludedAt(updated);
  }, [messages, storyState, setLastIncludedAt, customSegments]);
}
