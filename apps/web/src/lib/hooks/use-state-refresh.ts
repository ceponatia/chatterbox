"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type RefreshStatus = "idle" | "refreshing" | "paused" | "error";
export type SlowLaneStatus = "idle" | "checking" | "reconciling" | "error";

interface RefreshCheckResponse {
  eligible?: boolean;
  checkpointMessageId?: string;
  leaseRenewed?: boolean;
  ok?: boolean;
  error?: string;
}

interface SlowLaneCheckResponse {
  eligible?: boolean;
  candidateCount?: number;
  reason?: string;
  ok?: boolean;
  error?: string;
}

interface UseStateRefreshParams {
  conversationId: string | null;
  enabled: boolean;
  /** Trigger the regular state pipeline for a fast-lane refresh */
  triggerPipeline: () => void;
  /** Trigger slow-lane reconciliation when eligible */
  triggerSlowLane?: () => void;
}

const POLL_INTERVAL_MS = 45_000;
const SLOW_LANE_POLL_INTERVAL_MS = 300_000;

export function useStateRefresh({
  conversationId,
  enabled,
  triggerPipeline,
  triggerSlowLane,
}: UseStateRefreshParams) {
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [slowLaneStatus, setSlowLaneStatus] = useState<SlowLaneStatus>("idle");
  const [lastSlowLaneAt, setLastSlowLaneAt] = useState<Date | null>(null);
  const [pendingCandidateCount, setPendingCandidateCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowLaneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(false);
  const slowLaneInflightRef = useRef(false);
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

  const runSlowLaneCheck = useCallback(
    async (manualBypass = false) => {
      const cid = convIdRef.current;
      if (!cid || slowLaneInflightRef.current || !triggerSlowLane) return;
      slowLaneInflightRef.current = true;
      setSlowLaneStatus("checking");

      try {
        const res = await fetch(`/api/conversations/${cid}/refresh-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "slow-lane", manualBypass }),
        });

        if (!res.ok) {
          setSlowLaneStatus("error");
          return;
        }

        const data = (await res.json()) as SlowLaneCheckResponse;
        setPendingCandidateCount(data.candidateCount ?? 0);

        if (data.eligible) {
          setSlowLaneStatus("reconciling");
          triggerSlowLane();
          setLastSlowLaneAt(new Date());
          setSlowLaneStatus("idle");
        } else {
          setSlowLaneStatus("idle");
        }
      } catch {
        setSlowLaneStatus("error");
      } finally {
        slowLaneInflightRef.current = false;
      }
    },
    [triggerSlowLane],
  );

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

  // Slow-lane polling (separate cadence, never blocks fast lane)
  useEffect(() => {
    if (!enabled || !conversationId || !triggerSlowLane) {
      setSlowLaneStatus("idle");
      setPendingCandidateCount(0);
      if (slowLaneTimerRef.current) clearInterval(slowLaneTimerRef.current);
      return;
    }

    function startSlowLanePolling() {
      if (slowLaneTimerRef.current) clearInterval(slowLaneTimerRef.current);
      slowLaneTimerRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          void runSlowLaneCheck();
        }
      }, SLOW_LANE_POLL_INTERVAL_MS);
    }

    startSlowLanePolling();

    return () => {
      if (slowLaneTimerRef.current) clearInterval(slowLaneTimerRef.current);
    };
  }, [enabled, conversationId, triggerSlowLane, runSlowLaneCheck]);

  const triggerManualRefresh = useCallback(() => {
    manualBypassRef.current = true;
    void runRefreshCheck();
  }, [runRefreshCheck]);

  const triggerManualReconcile = useCallback(() => {
    void runSlowLaneCheck(true);
  }, [runSlowLaneCheck]);

  return {
    status,
    lastRefreshAt,
    triggerManualRefresh,
    slowLaneStatus,
    lastSlowLaneAt,
    pendingCandidateCount,
    triggerManualReconcile,
  };
}
