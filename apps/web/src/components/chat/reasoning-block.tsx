"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Brain, ChevronDown } from "lucide-react";

interface ReasoningBlockProps {
  text: string;
  state?: "streaming" | "done";
}

export function ReasoningBlock({ text, state }: ReasoningBlockProps) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDone = state === "done";

  // Default: expanded while streaming, collapsed when done.
  // User toggle overrides via manualExpanded.
  const expanded = manualExpanded ?? !isDone;

  // Auto-scroll reasoning content while streaming
  useEffect(() => {
    if (expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [text, expanded]);

  const handleToggle = () => {
    setManualExpanded((prev) => !(prev ?? !isDone));
  };

  return (
    <div className={cn(
      "mb-2 rounded-lg border transition-all",
      isDone
        ? "border-violet-500/20 bg-violet-500/5"
        : "border-violet-500/40 bg-violet-500/10"
    )}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        <Brain className={cn(
          "h-3 w-3 shrink-0 text-violet-500",
          !isDone && "animate-pulse"
        )} />
        <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
          {isDone ? "Reasoning" : "Thinking…"}
        </span>
        {isDone && (
          <span className="text-[10px] text-muted-foreground">
            {text.length} chars
          </span>
        )}
        <ChevronDown className={cn(
          "ml-auto h-3 w-3 text-muted-foreground transition-transform",
          expanded && "rotate-180"
        )} />
      </button>

      {expanded && (
        <div
          ref={contentRef}
          className="max-h-48 overflow-y-auto border-t border-violet-500/20 px-2.5 py-2"
        >
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {text}
            {!isDone && <span className="animate-pulse">▌</span>}
          </p>
        </div>
      )}
    </div>
  );
}
