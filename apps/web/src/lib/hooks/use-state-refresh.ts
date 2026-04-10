"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type RefreshStatus = "idle" | "refreshing" | "paused" | "error";

interface RefreshCheckResponse {
  eligible?: boolean;
  checkpointMessageId?: string;
  leaseRenewed?: boolean;
  ok?: boolean;
  error?: string;
}

interface UseStateRefreshParams {
  conversationId: string | null;
  enabled: boolean;
  /** Trigger the regular state pipeline for a fast-lane refresh */
  triggerPipeline: () => void;
}

const POLL_INTERVAL_MS = 45_000;

// TODO: Slow-lane reconciliation is deferred. The current implementation only
// runs fast-lane refreshes (recent messages via the existing state pipeline).
// Slow-lane work -- promoting candidate facts, resolving stale threads,
// structural integrity checks -- should be added as a separate background pass.

export function useStateRefresh({
  conversationId,
  enabled,
  triggerPipeline,
}: UseStateRefreshParams) {
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(false);
  const manualBypassRef = useRef(false);
  const convIdRef = useRef(conversationId);
  convIdRef.current = conversationId;

  const runRefreshCheck = useCallback(async () => {
    const cid = convIdRef.current;
    if (!cid || inflightRef.current) return;
    inflightRef.current = true;
    setStatus("refreshing");

    try {
      const res = await fetch(`/api/conversations/${cid}/refresh-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      const data = (await res.json()) as RefreshCheckResponse;

      if (data.eligible && data.checkpointMessageId) {
        // Fast-lane: trigger the existing state pipeline
        triggerPipeline();

        // Mark refresh complete with checkpoint
        try {
          await fetch(`/api/conversations/${cid}/refresh-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "complete",
              checkpointMessageId: data.checkpointMessageId,
            }),
          });
          setLastRefreshAt(new Date());
        } catch {
          // Pipeline ran but completion marker failed -- non-fatal
          console.warn("state-refresh: failed to mark refresh complete");
        }

        setStatus("idle");
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("error");
    } finally {
      inflightRef.current = false;
      manualBypassRef.current = false;
    }
  }, [triggerPipeline]);

  // Visibility-based polling
  useEffect(() => {
    if (!enabled || !conversationId) {
      setStatus("idle");
      return;
    }

    function startPolling() {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          void runRefreshCheck();
        }
      }, POLL_INTERVAL_MS);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setStatus((s) => (s === "paused" ? "idle" : s));
        startPolling();
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        setStatus((s) => (s === "idle" ? "paused" : s));
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startPolling();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, conversationId, runRefreshCheck]);

  const triggerManualRefresh = useCallback(() => {
    manualBypassRef.current = true;
    void runRefreshCheck();
  }, [runRefreshCheck]);

  return { status, lastRefreshAt, triggerManualRefresh };
}
