"use client";

import { Badge } from "@/components/ui/badge";
import { UIMessage } from "ai";

interface TurnCounterProps {
  messages: UIMessage[];
  autoSummarizeInterval: number;
}

export function TurnCounter({ messages, autoSummarizeInterval }: TurnCounterProps) {
  const turns = Math.floor(
    messages.filter((m) => m.role === "user").length
  );
  const turnsUntilSummarize = autoSummarizeInterval - (turns % autoSummarizeInterval);
  const nearSummarize = turnsUntilSummarize <= 3 && turns > 0;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="text-xs">
        Turn {turns}
      </Badge>
      {turns > 0 && (
        <Badge
          variant={nearSummarize ? "destructive" : "outline"}
          className="text-xs"
        >
          {nearSummarize
            ? `Summarize in ${turnsUntilSummarize}`
            : `Next summary: ${turnsUntilSummarize} turns`}
        </Badge>
      )}
    </div>
  );
}
