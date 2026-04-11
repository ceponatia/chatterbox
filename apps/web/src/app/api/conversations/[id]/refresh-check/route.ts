import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/get-user-id";
import { logRequest, logError } from "@/lib/api-logger";
import type { UIMessage } from "ai";

const COOLDOWN_MS = 60_000;
const LEASE_DURATION_MS = 120_000;
const SLOW_LANE_COOLDOWN_MS = 300_000;
const MIN_CANDIDATE_FACTS_FOR_SLOW_LANE = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastMessageId(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const last = messages[messages.length - 1] as UIMessage | undefined;
  return last?.id ?? null;
}

function hasNewMessages(
  messages: unknown,
  checkpointId: string | null,
): boolean {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (!checkpointId) return true;
  const last = messages[messages.length - 1] as UIMessage | undefined;
  return last?.id !== checkpointId;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleComplete(
  id: string,
  checkpointMessageId: string | undefined,
  newCandidateFacts?: unknown[],
) {
  if (!checkpointMessageId) {
    return NextResponse.json(
      { error: "checkpointMessageId required" },
      { status: 400 },
    );
  }
  try {
    // Merge new candidates with existing ones (dedup by content)
    let mergedCandidates: unknown[] = [];
    if (newCandidateFacts && newCandidateFacts.length > 0) {
      const existing = await prisma.conversation.findUnique({
        where: { id },
        select: { candidateFacts: true },
      });
      const existingFacts = Array.isArray(existing?.candidateFacts)
        ? (existing.candidateFacts as { content?: string }[])
        : [];
      const existingContents = new Set(
        existingFacts.map((f) => (f.content ?? "").toLowerCase().trim()),
      );
      const deduped = newCandidateFacts.filter((f) => {
        const content =
          (f as { content?: string }).content?.toLowerCase().trim() ?? "";
        return content.length > 0 && !existingContents.has(content);
      });
      mergedCandidates = [...existingFacts, ...deduped];
    }

    await prisma.conversation.update({
      where: { id },
      data: {
        lastStateUpdateAt: new Date(),
        lastStateCheckpointMessageId: checkpointMessageId,
        stateRefreshLeaseExpiresAt: null,
        ...(mergedCandidates.length > 0
          ? { candidateFacts: mergedCandidates as Prisma.InputJsonValue }
          : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("refresh-check complete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

async function handleCheck(
  id: string,
  conv: {
    messages: unknown;
    lastStateUpdateAt: Date | null;
    lastStateCheckpointMessageId: string | null;
    stateRefreshLeaseExpiresAt: Date | null;
  },
  leaseRenew: boolean,
) {
  const now = new Date();

  // Lease renewal for in-progress refresh
  if (
    leaseRenew &&
    conv.stateRefreshLeaseExpiresAt &&
    conv.stateRefreshLeaseExpiresAt > now
  ) {
    await prisma.conversation.update({
      where: { id },
      data: {
        stateRefreshLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });
    return NextResponse.json({ eligible: false, leaseRenewed: true });
  }

  const cooldownOk =
    !conv.lastStateUpdateAt ||
    now.getTime() - conv.lastStateUpdateAt.getTime() > COOLDOWN_MS;

  const leaseOk =
    !conv.stateRefreshLeaseExpiresAt || conv.stateRefreshLeaseExpiresAt <= now;

  const hasNew = hasNewMessages(
    conv.messages,
    conv.lastStateCheckpointMessageId,
  );

  if (cooldownOk && leaseOk && hasNew) {
    const checkpoint = lastMessageId(conv.messages);
    await prisma.conversation.update({
      where: { id },
      data: {
        stateRefreshLeaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });
    return NextResponse.json({
      eligible: true,
      checkpointMessageId: checkpoint,
    });
  }

  return NextResponse.json({ eligible: false });
}

async function handleSlowLaneCheck(
  id: string,
  conv: {
    lastSlowLaneAt: Date | null;
    stateRefreshLeaseExpiresAt: Date | null;
    candidateFacts: unknown;
  },
  manualBypass: boolean,
) {
  const now = new Date();

  if (
    conv.stateRefreshLeaseExpiresAt &&
    conv.stateRefreshLeaseExpiresAt > now
  ) {
    return NextResponse.json({
      eligible: false,
      reason: "fast-lane lease active",
    });
  }

  const cooldownOk =
    manualBypass ||
    !conv.lastSlowLaneAt ||
    now.getTime() - conv.lastSlowLaneAt.getTime() > SLOW_LANE_COOLDOWN_MS;

  if (!cooldownOk) {
    return NextResponse.json({
      eligible: false,
      reason: "slow-lane cooldown active",
    });
  }

  const candidates = Array.isArray(conv.candidateFacts)
    ? conv.candidateFacts
    : [];
  const candidateCount = candidates.length;

  if (!manualBypass && candidateCount < MIN_CANDIDATE_FACTS_FOR_SLOW_LANE) {
    return NextResponse.json({
      eligible: false,
      reason: "insufficient candidate facts",
      candidateCount,
    });
  }

  return NextResponse.json({
    eligible: true,
    candidateCount,
  });
}

async function handleSlowLaneComplete(
  id: string,
  remainingCandidates?: unknown[],
) {
  try {
    await prisma.conversation.update({
      where: { id },
      data: {
        lastSlowLaneAt: new Date(),
        candidateFacts: (remainingCandidates ?? []) as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("refresh-check slow-lane-complete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler -- dispatch on `action` field
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  const { id } = await params;
  const body = (await request.json()) as {
    action?: "check" | "complete" | "slow-lane" | "slow-lane-complete";
    leaseRenew?: boolean;
    manualBypass?: boolean;
    checkpointMessageId?: string;
    candidateFacts?: unknown[];
    remainingCandidates?: unknown[];
  };
  const action = body.action ?? "check";

  logRequest(`/api/conversations/${id}/refresh-check`, {
    action,
    leaseRenew: body.leaseRenew ?? false,
  });

  const conv = await prisma.conversation.findFirst({
    where: { id, userId },
    select: {
      id: true,
      messages: true,
      lastStateUpdateAt: true,
      lastStateCheckpointMessageId: true,
      stateRefreshLeaseExpiresAt: true,
      lastSlowLaneAt: true,
      candidateFacts: true,
    },
  });

  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "slow-lane") {
    return handleSlowLaneCheck(id, conv, body.manualBypass ?? false);
  }

  if (action === "slow-lane-complete") {
    return handleSlowLaneComplete(id, body.remainingCandidates);
  }

  if (action === "complete") {
    return handleComplete(id, body.checkpointMessageId, body.candidateFacts);
  }

  return handleCheck(id, conv, body.leaseRenew ?? false);
}
