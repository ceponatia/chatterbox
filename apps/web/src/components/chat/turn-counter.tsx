"use client";

import { Badge } from "@/components/ui/badge";
import { UIMessage } from "ai";

interface TurnCounterProps {
  messages: UIMessage[];
  autoSummarizeInterval: number;
  lastPipelineTurn: number;
}

export function TurnCounter({ messages, autoSummarizeInterval, lastPipelineTurn }: TurnCounterProps) {
  const turns = messages.filter((m) => m.role === "user").length;
  const sinceLast = turns - lastPipelineTurn;
  const turnsUntilUpdate = autoSummarizeInterval - (sinceLast % autoSummarizeInterval);
  const nearUpdate = turnsUntilUpdate <= 3 && turns > 0;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="text-xs">
        Turn {turns}
      </Badge>
      {turns > 0 && (
        <Badge
          variant={nearUpdate ? "destructive" : "outline"}
          className="text-xs"
        >
          {nearUpdate
            ? `State update in ${turnsUntilUpdate}`
            : `Next update: ${turnsUntilUpdate} turns`}
        </Badge>
      )}
    </div>
  );
}
