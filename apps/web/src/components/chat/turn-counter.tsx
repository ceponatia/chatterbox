"use client";

import { Badge } from "@/components/ui/badge";
import { UIMessage } from "ai";

interface TurnCounterProps {
  messages: UIMessage[];
  autoSummarizeInterval: number;
  lastSummarizedTurn: number;
}

export function TurnCounter({ messages, autoSummarizeInterval, lastSummarizedTurn }: TurnCounterProps) {
  const turns = messages.filter((m) => m.role === "user").length;
  const sinceLast = turns - lastSummarizedTurn;
  const turnsUntilSummarize = autoSummarizeInterval - (sinceLast % autoSummarizeInterval);
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
