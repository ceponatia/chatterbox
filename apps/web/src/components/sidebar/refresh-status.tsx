"use client";

import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, Loader2, Pause, AlertCircle } from "lucide-react";
import type { RefreshStatus } from "@/lib/hooks/use-state-refresh";

interface RefreshStatusProps {
  status: RefreshStatus;
  lastRefreshAt: Date | null;
  onManualRefresh: () => void;
  slowLaneStatus?: "idle" | "checking" | "reconciling" | "error";
  lastSlowLaneAt?: Date | null;
  pendingCandidateCount?: number;
  onManualReconcile?: () => void;
}

function formatTimestamp(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export const RefreshStatusIndicator = memo(function RefreshStatusIndicator({
  status,
  lastRefreshAt,
  onManualRefresh,
  slowLaneStatus,
  lastSlowLaneAt: _lastSlowLaneAt,
  pendingCandidateCount,
  onManualReconcile,
}: RefreshStatusProps) {
  const handleRetry = useCallback(() => {
    onManualRefresh();
  }, [onManualRefresh]);

  const timestamp = formatTimestamp(lastRefreshAt);

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {status === "refreshing" && (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            <span>Updating state...</span>
          </>
        )}
        {status === "paused" && (
          <>
            <Pause className="h-3 w-3 text-yellow-500" />
            <span>Refresh paused</span>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="h-3 w-3 text-red-400" />
            <span className="text-red-400">Refresh error</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px]"
              onClick={handleRetry}
            >
              Retry
            </Button>
          </>
        )}
        {status === "idle" && timestamp && (
          <>
            <Check className="h-3 w-3 text-green-500" />
            <span>Updated {timestamp}</span>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-5 w-5 p-0"
          title="Refresh state now"
          onClick={handleRetry}
          disabled={status === "refreshing"}
        >
          <RefreshCw
            className={`h-3 w-3 ${status === "refreshing" ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
      {(slowLaneStatus || pendingCandidateCount !== undefined) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {slowLaneStatus === "checking" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
              <span>Checking candidates...</span>
            </>
          )}
          {slowLaneStatus === "reconciling" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
              <span>Reconciling state...</span>
            </>
          )}
          {slowLaneStatus === "error" && (
            <>
              <AlertCircle className="h-3 w-3 text-red-400" />
              <span className="text-red-400">Reconciliation error</span>
            </>
          )}
          {slowLaneStatus === "idle" &&
            pendingCandidateCount !== undefined &&
            pendingCandidateCount > 0 && (
              <span>
                {pendingCandidateCount} pending fact
                {pendingCandidateCount !== 1 ? "s" : ""}
              </span>
            )}
          {onManualReconcile && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-5 px-1.5 text-[10px]"
              title="Run reconciliation now"
              onClick={onManualReconcile}
              disabled={
                slowLaneStatus === "checking" ||
                slowLaneStatus === "reconciling"
              }
            >
              Reconcile
            </Button>
          )}
        </div>
      )}
    </>
  );
});
